import { describe, expect, it } from "vitest";

import {
  formatPhone, isCompatibleGroup, onlineAccountState, placementIssues, studentFormDefaults, studentFormSchema, studentRecordInputSchema, toDomesticPhone,
} from "./validation";

const ACADEMY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const YEAR = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const SCIENCE = "55555555-5555-4555-8555-555555555555";
const ARTS = "66666666-6666-4666-8666-666666666666";
const SCIENCE_GROUP = "77777777-7777-4777-8777-777777777777";
const GRADE_9_GROUP = "88888888-8888-4888-8888-888888888888";

const context = {
  tracks: [
    { id: SCIENCE, level_id: "secondary-2" },
    { id: ARTS, level_id: "secondary-2" },
  ],
  groups: [
    { id: SCIENCE_GROUP, level_id: "secondary-2", track_id: SCIENCE },
    { id: GRADE_9_GROUP, level_id: "preparatory-3", track_id: null },
  ],
};

const schema = studentFormSchema({ academyId: ACADEMY, academicYearId: YEAR }, context);
const valid = {
  fullName: "  Mariam Hassan ",
  studentPhone: "010 1234 5678",
  parentPhone: "+20 111 222 3333",
  levelId: "preparatory-3",
  trackId: "",
  primaryGroupId: "",
  participationType: "in_person" as const,
};

const issuePaths = (value: unknown) => {
  const result = schema.safeParse(value);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
};

describe("student form schema", () => {
  it("normalizes names and phones and produces nullable placement ids", () => {
    const result = schema.parse(valid);
    expect(result).toEqual({
      academyId: ACADEMY,
      academicYearId: YEAR,
      fullName: "Mariam Hassan",
      studentPhone: "+201012345678",
      parentPhone: "+201112223333",
      levelId: "preparatory-3",
      trackId: null,
      primaryGroupId: null,
      participationType: "in_person",
    });
  });

  it("requires name, both phones, level, and an explicitly chosen student type", () => {
    expect(issuePaths({ ...valid, fullName: "   " })).toContain("fullName");
    expect(issuePaths({ ...valid, studentPhone: "" })).toContain("studentPhone");
    expect(issuePaths({ ...valid, parentPhone: "" })).toContain("parentPhone");
    expect(issuePaths({ ...valid, studentPhone: "0123" })).toContain("studentPhone");
    expect(issuePaths({ ...valid, levelId: "" })).toContain("levelId");
    expect(issuePaths({ ...valid, participationType: "" })).toContain("participationType");
  });

  it("accepts Arabic names and names up to 200 characters", () => {
    expect(schema.safeParse({ ...valid, fullName: "مريم حسن" }).success).toBe(true);
    expect(schema.safeParse({ ...valid, fullName: "a".repeat(200) }).success).toBe(true);
    expect(issuePaths({ ...valid, fullName: "a".repeat(201) })).toContain("fullName");
  });

  it("requires a track only for levels that have tracks", () => {
    expect(issuePaths({ ...valid, levelId: "secondary-2" })).toEqual(["trackId"]);
    expect(schema.safeParse({ ...valid, levelId: "secondary-2", trackId: SCIENCE }).success).toBe(true);
    expect(issuePaths({ ...valid, trackId: SCIENCE })).toEqual(["trackId"]);
  });

  it("keeps the group optional and rejects incompatible groups", () => {
    expect(schema.parse({ ...valid, primaryGroupId: GRADE_9_GROUP }).primaryGroupId).toBe(GRADE_9_GROUP);
    expect(issuePaths({ ...valid, primaryGroupId: SCIENCE_GROUP })).toEqual(["primaryGroupId"]);
    expect(issuePaths({ ...valid, levelId: "secondary-2", trackId: ARTS, primaryGroupId: SCIENCE_GROUP })).toEqual(["primaryGroupId"]);
    expect(schema.safeParse({ ...valid, levelId: "secondary-2", trackId: SCIENCE, primaryGroupId: SCIENCE_GROUP }).success).toBe(true);
  });

  it("reports no placement issues before a level is chosen", () => {
    expect(placementIssues({ levelId: "", trackId: "", primaryGroupId: "" }, context)).toEqual([]);
  });
});

describe("server input schema", () => {
  it("accepts only canonicalizable phones and known student types", () => {
    const input = { ...valid, academyId: ACADEMY, academicYearId: YEAR, trackId: null, primaryGroupId: null };
    expect(studentRecordInputSchema.safeParse(input).success).toBe(true);
    expect(studentRecordInputSchema.safeParse({ ...input, participationType: "hybrid" }).success).toBe(false);
    expect(studentRecordInputSchema.safeParse({ ...input, academyId: "not-a-uuid" }).success).toBe(false);
    expect(studentRecordInputSchema.safeParse({ ...input, parentPhone: "" }).success).toBe(false);
  });
});

describe("phone display", () => {
  it("shows canonical numbers in the domestic format staff type", () => {
    expect(toDomesticPhone("+201012345678")).toBe("01012345678");
    expect(formatPhone("+201012345678")).toBe("0101 234 5678");
    expect(formatPhone("unexpected")).toBe("unexpected");
  });

  it("prefills the edit form with national phones and empty selects", () => {
    expect(studentFormDefaults({
      fullName: "Omar", studentPhone: "+201012345678", parentPhone: "+201112223333",
      levelId: "preparatory-3", trackId: null, primaryGroupId: null, participationType: "online_only",
    })).toMatchObject({ studentPhone: "1012345678", trackId: "", primaryGroupId: "", participationType: "online_only" });
    expect(studentFormDefaults().participationType).toBe("");
  });
});

describe("group compatibility", () => {
  const context = {
    tracks: [{ id: "sci", level_id: "g11" }, { id: "lit", level_id: "g11" }],
    groups: [
      { id: "all", level_id: "g11", track_id: null },
      { id: "sci-a", level_id: "g11", track_id: "sci" },
      { id: "nine", level_id: "g9", track_id: null },
    ],
  };
  const placement = (levelId: string, trackId: string, primaryGroupId: string) => ({ levelId, trackId, primaryGroupId });

  it("accepts a level-wide group for every track of its level", () => {
    expect(isCompatibleGroup(placement("g11", "sci", "all"), context)).toBe(true);
    expect(isCompatibleGroup(placement("g11", "lit", "all"), context)).toBe(true);
  });

  it("requires the same track for a track-specific group", () => {
    expect(isCompatibleGroup(placement("g11", "sci", "sci-a"), context)).toBe(true);
    expect(isCompatibleGroup(placement("g11", "lit", "sci-a"), context)).toBe(false);
  });

  it("rejects another level and unknown groups", () => {
    expect(isCompatibleGroup(placement("g11", "sci", "nine"), context)).toBe(false);
    expect(isCompatibleGroup(placement("g9", "", "all"), context)).toBe(false);
    expect(isCompatibleGroup(placement("g9", "", "nine"), context)).toBe(true);
    expect(isCompatibleGroup(placement("g11", "sci", "missing"), context)).toBe(false);
  });
});

describe("onlineAccountState", () => {
  it("matches the list and edit-sheet rule for every link and suspension combination", () => {
    expect(onlineAccountState(null, null, null)).toBe("not_connected");
    expect(onlineAccountState(null, "2030-01-01", "2030-01-01")).toBe("not_connected");
    expect(onlineAccountState("u", null, null)).toBe("connected");
    expect(onlineAccountState("u", "2030-01-01", null)).toBe("suspended");
    expect(onlineAccountState("u", null, "2030-01-01")).toBe("suspended");
  });
});
