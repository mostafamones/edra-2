import { describe, expect, it } from "vitest";

import { failureFromDatabase } from "./errors";
import {
  clampPageIndex, DEFAULT_LIST_PARAMS, isFiltering, parseSorts, readListParams, writeListParams,
} from "./list-params";

const GROUP = "77777777-7777-4777-8777-777777777777";
const TRACK = "55555555-5555-4555-8555-555555555555";
const read = (query: string, fallback?: 10 | 20 | 50 | 100) => readListParams(new URLSearchParams(query), fallback);

describe("list parameters", () => {
  it("defaults to active records, name order, the first page, and 20 rows", () => {
    expect(read("")).toEqual({ params: DEFAULT_LIST_PARAMS, valid: true });
    expect(DEFAULT_LIST_PARAMS.pageSize).toBe(10);
    expect(DEFAULT_LIST_PARAMS.sorts).toEqual([{ id: "name", desc: false }]);
  });

  it("round-trips every parameter through the URL", () => {
    const params = {
      search: "0101 234", status: "all" as const, levelId: "secondary-2", track: TRACK, group: GROUP,
      participationType: "online_only" as const, sorts: [{ id: "level" as const, desc: true }, { id: "group" as const, desc: false }],
      pageIndex: 3, pageSize: 50 as const,
    };
    expect(read(writeListParams(params).toString())).toEqual({ params, valid: true });
  });

  it("omits defaults from the URL", () => {
    expect(writeListParams(DEFAULT_LIST_PARAMS).toString()).toBe("");
  });

  it("uses the stored page size unless the URL sets one", () => {
    expect(read("", 50).params.pageSize).toBe(50);
    expect(read("size=10", 50).params.pageSize).toBe(10);
  });

  it("replaces invalid values with defaults and reports them", () => {
    for (const query of ["status=deleted", "size=25", "page=0", "page=abc", "sort=password.asc", "type=hybrid",
      "group=1;drop", "level=Grade%2010", "track=" + TRACK, "q=" + "x".repeat(101)]) {
      expect(read(query).valid).toBe(false);
    }
    expect(read("size=25&page=0&status=deleted").params).toEqual(DEFAULT_LIST_PARAMS);
  });

  it("drops a track filter without a level", () => {
    expect(read(`track=${TRACK}`).params.track).toBeNull();
  });

  it("accepts the special no-track and unassigned filters", () => {
    expect(read("level=secondary-2&track=none&group=none").params).toMatchObject({ track: "none", group: "none" });
  });

  it("allows up to three distinct sort fields", () => {
    expect(parseSorts("name.asc,level.desc,group.asc")).toHaveLength(3);
    expect(parseSorts("name.asc,level.desc,group.asc,track.asc")).toBeNull();
    expect(parseSorts("name.asc,name.desc")).toBeNull();
    expect(parseSorts("")).toEqual([]);
  });

  it("knows when the list is narrowed", () => {
    expect(isFiltering(DEFAULT_LIST_PARAMS)).toBe(false);
    expect(isFiltering({ ...DEFAULT_LIST_PARAMS, status: "archived" })).toBe(true);
    expect(isFiltering({ ...DEFAULT_LIST_PARAMS, sorts: [], pageIndex: 4 })).toBe(false);
  });

  it("clamps a page emptied by archiving back to the last page", () => {
    expect(clampPageIndex(5, 41, 20)).toBe(2);
    expect(clampPageIndex(1, 0, 20)).toBe(0);
    expect(clampPageIndex(1, 40, 20)).toBe(1);
  });
});

describe("database error mapping", () => {
  it("maps stable codes and attaches field errors", () => {
    expect(failureFromDatabase({ code: "P0001", message: "duplicate_student_phone" })).toMatchObject({
      code: "duplicate_student_phone", fieldErrors: { studentPhone: expect.any(String) },
    });
    expect(failureFromDatabase({ code: "P0001", message: "validation", hint: "parent_phone" }).fieldErrors).toHaveProperty("parentPhone");
    expect(failureFromDatabase({ code: "P0001", message: "stale_record" }).code).toBe("stale_record");
  });

  it("never echoes unknown database messages", () => {
    const failure = failureFromDatabase({ code: "42P01", message: "relation \"secret\" does not exist" });
    expect(failure.code).toBe("unavailable");
    expect(failure.message).not.toContain("secret");
    expect(failureFromDatabase({ code: "P0001", message: "something else" }).code).toBe("unavailable");
  });
});
