import { describe, expect, it } from "vitest";

import type { DraftPart } from "./types";
import { assignmentDraftSchema, assignmentFormDefaults, assignmentFormSchema, formMaxScore } from "./validation";

const GROUP = "11111111-1111-4111-8111-111111111111";
const TRACK = "22222222-2222-4222-8222-222222222222";
const base = {
  title: "Unit 3", instructions: "", audience: "level" as const, levelId: "secondary-1", trackId: null,
  groupIds: [] as string[], dueAt: null,
  parts: [
    { title: "A", instructions: "", kind: null, maxScore: "10", questions: [] },
    { title: "B", instructions: "", kind: null, maxScore: "15", questions: [] },
  ] as DraftPart[],
};
const choices = (correct: number) => [0, 1, 2].map((index) => ({ label: `c${index}`, isCorrect: index === correct }));
const typed = (kind: DraftPart["kind"], questions: DraftPart["questions"]): DraftPart => ({ title: "T", instructions: "", kind, maxScore: "0", questions });

describe("assignment draft validation", () => {
  it("accepts each audience form with the right shape", () => {
    expect(assignmentDraftSchema.safeParse(base).success).toBe(true);
    expect(assignmentDraftSchema.safeParse({ ...base, audience: "program", trackId: TRACK }).success).toBe(true);
    expect(assignmentDraftSchema.safeParse({ ...base, audience: "groups", levelId: null, groupIds: [GROUP] }).success).toBe(true);
  });

  it("rejects mixed or incomplete audiences", () => {
    expect(assignmentDraftSchema.safeParse({ ...base, audience: "program" }).success).toBe(false);
    expect(assignmentDraftSchema.safeParse({ ...base, trackId: TRACK }).success).toBe(false);
    expect(assignmentDraftSchema.safeParse({ ...base, audience: "groups", levelId: null }).success).toBe(false);
    expect(assignmentDraftSchema.safeParse({ ...base, audience: "groups", groupIds: [GROUP] }).success).toBe(false);
    expect(assignmentDraftSchema.safeParse({ ...base, audience: "groups", levelId: null, groupIds: [GROUP, GROUP] }).success).toBe(false);
  });

  it("requires at least one part with an exact positive maximum", () => {
    expect(assignmentDraftSchema.safeParse({ ...base, parts: [] }).success).toBe(false);
    expect(assignmentDraftSchema.safeParse({ ...base, parts: [{ ...base.parts[0], maxScore: "0" }] }).success).toBe(false);
    expect(assignmentDraftSchema.safeParse({ ...base, parts: [{ ...base.parts[0], maxScore: "2.555" }] }).success).toBe(false);
  });

  it("accepts an unfinished typed draft but rejects bad questions and marks", () => {
    const question = { prompt: "", maxScore: "2", choices: choices(1) };
    expect(assignmentDraftSchema.safeParse({ ...base, parts: [typed("online_questions", [])] }).success).toBe(true);
    expect(assignmentDraftSchema.safeParse({ ...base, parts: [typed("online_questions", [question])] }).success).toBe(true);
    for (const maxScore of ["0", "-1", "1.005", "1001", ""]) {
      expect(assignmentDraftSchema.safeParse({ ...base, parts: [typed("answer_sheet", [{ ...question, maxScore }])] }).success).toBe(false);
    }
    expect(assignmentDraftSchema.safeParse({ ...base, parts: [typed("answer_sheet", [{ ...question, choices: choices(0).map((choice) => ({ ...choice, isCorrect: true })) }])] }).success).toBe(false);
  });

  it("gives file-upload entries marks but no choices, and legacy parts no questions", () => {
    const entry = { prompt: "", maxScore: "5", choices: [] };
    expect(assignmentDraftSchema.safeParse({ ...base, parts: [typed("file_upload", [entry])] }).success).toBe(true);
    expect(assignmentDraftSchema.safeParse({ ...base, parts: [typed("file_upload", [{ ...entry, choices: choices(0) }])] }).success).toBe(false);
    expect(assignmentDraftSchema.safeParse({ ...base, parts: [{ ...base.parts[0], questions: [entry] }] }).success).toBe(false);
  });

  it("rejects repeated question or choice ids and parts totalling above the bound", () => {
    const id = "33333333-3333-4333-8333-333333333333";
    const entry = { prompt: "", maxScore: "5", choices: [] };
    expect(assignmentDraftSchema.safeParse({ ...base, parts: [typed("file_upload", [{ ...entry, id }, { ...entry, id }])] }).success).toBe(false);
    const big = Array.from({ length: 11 }, () => ({ ...entry, maxScore: "1000" }));
    expect(assignmentDraftSchema.safeParse({ ...base, parts: [typed("file_upload", big)] }).success).toBe(false);
  });

  it("rejects unknown fields such as a caller-supplied total", () => {
    expect(assignmentDraftSchema.safeParse({ ...base, maxScore: "25" }).success).toBe(false);
  });

  it("derives the assignment maximum from the parts", () => {
    expect(formMaxScore([{ kind: "legacy", maxScore: "10", questions: [] }, { kind: "legacy", maxScore: "15", questions: [] }])).toBe("25");
    expect(formMaxScore([{ kind: "legacy", maxScore: "10", questions: [] }, { kind: "legacy", maxScore: "", questions: [] }])).toBeNull();
  });

  it("sums question marks into part and assignment maxima, ignoring a typed part's own maximum", () => {
    const question = (maxScore: string) => ({ prompt: "", maxScore, choices: [] });
    expect(formMaxScore([
      { kind: "file_upload", maxScore: "999", questions: [question("2.5"), question("0.1"), question("0.2")] },
      { kind: "answer_sheet", maxScore: "", questions: [question("4")] },
      { kind: "legacy", maxScore: "10", questions: [] },
    ])).toBe("16.8");
  });

  it("turns form values into a draft with the due date in Cairo time", () => {
    const values = { ...assignmentFormDefaults(), title: " Unit 3 ", levelId: "secondary-1", dueDate: "2027-01-15", dueTime: "23:59",
      parts: [
        { title: "A", instructions: "", kind: "file_upload" as const, maxScore: "", questions: [{ prompt: "", maxScore: "10", choices: [] }] },
        { title: "B", instructions: "", kind: "legacy" as const, maxScore: "15", questions: [] },
      ] };
    const parsed = assignmentFormSchema.safeParse(values);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({ title: "Unit 3", audience: "level", levelId: "secondary-1", trackId: null, groupIds: [], dueAt: "2027-01-15T21:59:00.000Z" });
    expect(parsed.data?.parts.map((part) => [part.kind, part.maxScore, part.questions.length])).toEqual([["file_upload", "0", 1], [null, "15", 0]]);
    expect(assignmentDraftSchema.safeParse(parsed.data).success).toBe(true);
  });
});
