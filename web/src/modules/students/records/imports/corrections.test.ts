import { describe, expect, it } from "vitest";

import { editableFields, rowFormValues, validateCorrection } from "./corrections";
import type { ImportRow } from "./types";

const ACADEMY = "00000000-0000-4000-8000-000000000001";
const YEAR = "00000000-0000-4000-8000-000000000002";
const LEVEL = "00000000-0000-4000-8000-000000000003";
const TRACK = "00000000-0000-4000-8000-000000000004";
const context = { tracks: [{ id: TRACK, level_id: LEVEL }], groups: [] };

const row = (overrides: Partial<ImportRow>): ImportRow => ({
  ordinal: 1, sourceRow: 2, source: {}, corrected: false, input: null, issues: [], excluded: false, status: "invalid",
  existingArchived: null, duplicateRows: null, batchIndex: null, outcome: null, outcomeCode: null, recordId: null,
  levelName: null, trackName: null, groupName: null, ...overrides,
});

describe("inline import corrections", () => {
  it("starts from resolved values and falls back to the file's text", () => {
    const values = rowFormValues(row({
      source: { full_name: "Mona", student_phone: "0101" },
      input: { full_name: null, student_phone: null, parent_phone: "+201012345678", level_id: LEVEL, track_id: null, primary_group_id: null, participation_type: "online_only" },
    }));
    expect(values).toMatchObject({ fullName: "Mona", studentPhone: "0101", parentPhone: "1012345678", levelId: LEVEL, participationType: "online_only" });
  });

  it("edits the track and group of a row whose level is wrong once the level has tracks", () => {
    const invalid = row({ issues: [{ field: "level", code: "unknown" }] });
    expect([...editableFields(invalid, rowFormValues(invalid), context)].sort()).toEqual(["group", "level"]);
    expect([...editableFields(invalid, { ...rowFormValues(invalid), levelId: LEVEL }, context)].sort()).toEqual(["group", "level", "track"]);
  });

  it("reports failed checks by import field and produces the action input when valid", () => {
    const values = { fullName: "Mona", studentPhone: "01012345678", parentPhone: "123", levelId: LEVEL, trackId: "", primaryGroupId: "", participationType: "in_person" as const };
    const failed = validateCorrection(values, { academyId: ACADEMY, academicYearId: YEAR }, context);
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(Object.keys(failed.errors).sort()).toEqual(["parent_phone", "track"]);

    const fixed = validateCorrection({ ...values, parentPhone: "1112345678", trackId: TRACK }, { academyId: ACADEMY, academicYearId: YEAR }, context);
    expect(fixed).toMatchObject({ ok: true, input: { studentPhone: "+201012345678", parentPhone: "+201112345678", trackId: TRACK } });
  });
});
