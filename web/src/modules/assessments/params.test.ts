import { describe, expect, it } from "vitest";

import { changeParams, DEFAULT_PARAMS, readParams, writeParams } from "./params";
import { DEFAULT_STATUSES, STATUS_KEYS } from "./types";

const read = (query: string) => readParams(new URLSearchParams(query));

describe("Assessments list URL state", () => {
  it("defaults to all types, every audience, no archived, newest first, page 1", () => {
    expect(read("")).toEqual(DEFAULT_PARAMS);
    expect(writeParams(DEFAULT_PARAMS).toString()).toBe("");
  });

  it("round-trips every value", () => {
    const params = { type: "quiz", search: "unit 3", audience: "groups", level: "preparatory-3", track: null, groupId: "8f1a2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4b", statuses: ["assignment:archived", "quiz:open"], sort: "title", group: "status", page: 2, pageSize: 48 } as const;
    expect(read(writeParams({ ...params, statuses: [...params.statuses] }).toString())).toEqual(params);
    // The list always shows the active year; a year in the URL is ignored.
    expect(read("year=all")).toEqual(DEFAULT_PARAMS);
  });

  it("hides only archived statuses by default and keeps an explicit selection, including none, in canonical order", () => {
    expect(DEFAULT_PARAMS.statuses).toEqual(STATUS_KEYS.filter((key) => !key.endsWith(":archived")));
    expect(writeParams(DEFAULT_PARAMS).has("statuses")).toBe(false);
    expect(read("statuses=quiz:open,assignment:active,quiz:open").statuses).toEqual(["assignment:active", "quiz:open"]);
    expect(read("statuses=").statuses).toEqual([]);
    expect(writeParams({ ...DEFAULT_PARAMS, statuses: [] }).toString()).toBe("statuses=");
  });

  it.each([
    "type=homework", "type=", "audience=everyone", "level=Bad Level", "track=nope", "groupId=nope", "statuses=quiz:active", "statuses=open", "group=audience", "sort=oldest", "page=0", "page=-1", "page=1.5", "page=abc",
    `q=${"x".repeat(201)}`, "pageSize=0", "pageSize=500", "pageSize=abc", "pageSize=12.5",
  ])("falls back to defaults for invalid %s", (query) => {
    expect(read(query)).toEqual(DEFAULT_PARAMS);
  });

  it("resets paging on search, filter, order or type changes and keeps compatible filters", () => {
    const current = { ...DEFAULT_PARAMS, search: "unit", audience: "program" as const, statuses: [...STATUS_KEYS], sort: "title" as const, group: "type" as const, page: 4 };
    expect(changeParams(current, { type: "exam" })).toEqual({ ...current, type: "exam", page: 0 });
    expect(changeParams(current, { search: "unit 4" }).page).toBe(0);
    expect(changeParams(current, { audience: "groups" }).page).toBe(0);
    expect(changeParams(current, { statuses: [...DEFAULT_STATUSES] }).page).toBe(0);
    expect(changeParams(current, { group: "status" }).page).toBe(0);
    expect(changeParams(current, { sort: "newest" }).page).toBe(0);
    expect(changeParams(current, { pageSize: 48 })).toEqual({ ...current, pageSize: 48, page: 0 });
    expect(changeParams(current, { page: 5 })).toEqual({ ...current, page: 5 });
  });
});
