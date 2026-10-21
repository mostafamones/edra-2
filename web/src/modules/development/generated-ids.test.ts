import { describe, expect, it } from "vitest";
import { z } from "zod";

import { examDraftSchema } from "@/modules/exams/validation";
import { decodeCursor, encodeCursor } from "@/modules/sessions/cursor";
import { studentRecordInputSchema } from "@/modules/students/records/validation";

import { RECIPE_VERSIONS, buildScenario } from "../../../scripts/dev-academy/scenario.mjs";

const MALFORMED = ["not-a-uuid", "12103d45-8372-f5cc-2ec5-94a8b0dcf5e", "12103d45-8372-f5cc-2ec5-94a8b0dcf5eg", "12103d4583725cc2ec594a8b0dcf5e4"];
const isRfc = (id: string) => z.uuid().safeParse(id).success;

const student = (academyId: string, primaryGroupId: string) => ({
  academyId, academicYearId: academyId, fullName: "Student", studentPhone: "010 1234 5678", parentPhone: "+20 111 222 3333",
  levelId: "preparatory-3", trackId: null, primaryGroupId, participationType: "in_person",
});
const exam = (groupIds: string[]) => ({
  title: "Exam", instructions: "", solutionNotes: "", audience: "groups", levelId: null, trackId: null, groupIds, timeLimitMinutes: 60, parts: [],
});

describe.each(RECIPE_VERSIONS)("generated development academy IDs (%s)", (recipeVersion) => {
  const scenario = buildScenario({ recipeVersion });

  it("include IDs without an RFC version or variant", () => {
    expect(isRfc(scenario.academy.id)).toBe(false);
    expect(scenario.sessions.some((session) => !isRfc(session.id))).toBe(true);
    expect(scenario.exams.some((item) => item.groupIds.some((id: string) => !isRfc(id)))).toBe(true);
  });

  it("pass student record validation and malformed IDs are rejected", () => {
    for (const placement of scenario.placements) {
      expect(studentRecordInputSchema.safeParse(student(scenario.academy.id, placement.groupId)).success).toBe(true);
    }
    for (const id of MALFORMED) {
      expect(studentRecordInputSchema.safeParse(student(id, scenario.placements[0].groupId)).success).toBe(false);
      expect(studentRecordInputSchema.safeParse(student(scenario.academy.id, id)).success).toBe(false);
    }
  });

  it("round-trip session cursors and malformed IDs are rejected", () => {
    for (const session of scenario.sessions) {
      const cursor = { startedAt: session.startsAt, id: session.id };
      expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
    }
    for (const id of MALFORMED) {
      expect(decodeCursor(encodeCursor({ startedAt: scenario.sessions[0].startsAt, id }))).toBeNull();
    }
  });

  it("pass assessment audience validation and malformed IDs are rejected", () => {
    for (const item of scenario.exams) expect(examDraftSchema.safeParse(exam(item.groupIds)).success).toBe(true);
    for (const id of MALFORMED) expect(examDraftSchema.safeParse(exam([id])).success).toBe(false);
  });
});
