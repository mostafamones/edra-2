import { describe, expect, it } from "vitest";

import { draftIssues, emptyExamValues, formErrors, isValidQuestionMax, examDraftSchema, examToValues, valuesToDraft } from "./validation";
import type { Exam, ExamDraft } from "./types";

const draft = (change: Partial<ExamDraft> = {}): ExamDraft => ({
  title: "Term exam", instructions: "", solutionNotes: "", audience: "level", levelId: "grade-9", trackId: null, groupIds: [], timeLimitMinutes: 60,
  parts: [{ title: "P", instructions: "", kind: "question_sheet", questions: [{ prompt: "", modelAnswer: "", maxScore: "2", choices: [{ label: "A", isCorrect: true }, { label: "B", isCorrect: false }] }] }],
  ...change,
});

describe("examDraftSchema", () => {
  it("accepts incomplete preparation without a target, timer or parts", () => {
    expect(examDraftSchema.safeParse(draft({ audience: null, levelId: null, timeLimitMinutes: null, parts: [] })).success).toBe(true);
  });

  it("rejects timers outside 1 to 600 whole minutes", () => {
    expect(examDraftSchema.safeParse(draft({ timeLimitMinutes: 0 })).success).toBe(false);
    expect(examDraftSchema.safeParse(draft({ timeLimitMinutes: 601 })).success).toBe(false);
    expect(examDraftSchema.safeParse(draft({ timeLimitMinutes: 1.5 })).success).toBe(false);
  });

  it("rejects Answer Sheet parts, choices on written work and two correct choices", () => {
    expect(examDraftSchema.safeParse(draft({ parts: [{ title: "P", instructions: "", kind: "answer_sheet" as never, questions: [] }] })).success).toBe(false);
    expect(examDraftSchema.safeParse(draft({ parts: [{ title: "P", instructions: "", kind: "written_work", questions: [{ prompt: "", modelAnswer: "", maxScore: "2", choices: [{ label: "A", isCorrect: false }] }] }] })).success).toBe(false);
    const two = draft();
    two.parts[0].questions[0].choices[1].isCorrect = true;
    expect(examDraftSchema.safeParse(two).success).toBe(false);
  });

  it("rejects unsupported precision rather than rounding", () => {
    expect(isValidQuestionMax("2.5")).toBe(true);
    expect(isValidQuestionMax("2.555")).toBe(false);
    expect(isValidQuestionMax("0")).toBe(false);
    expect(isValidQuestionMax("1000.01")).toBe(false);
  });

  it("checks the audience shape", () => {
    expect(examDraftSchema.safeParse(draft({ audience: "groups", levelId: null, groupIds: [] })).success).toBe(false);
    expect(examDraftSchema.safeParse(draft({ audience: "program", trackId: null })).success).toBe(false);
  });
});

describe("draftIssues", () => {
  it("mirrors the database readiness rules", () => {
    expect(draftIssues(draft())).toEqual([]);
    expect(draftIssues(draft({ audience: null, levelId: null, parts: [] })).map((issue) => issue.issue)).toEqual(["target", "parts"]);
    // Every exam needs its timer before it is ready.
    expect(draftIssues(draft({ timeLimitMinutes: null })).map((issue) => issue.issue)).toEqual(["timer"]);
    const unkeyed = draft();
    unkeyed.parts[0].questions[0].choices = [{ label: "", isCorrect: false }];
    expect(draftIssues(unkeyed).map((issue) => issue.issue)).toEqual(["choices", "correct_choice", "choice_text"]);
  });
});

describe("form conversion", () => {
  it("round-trips an exam, keeping ids and the key", () => {
    const exam = {
      title: "Q", instructions: "", solutionNotes: "", audience: "program", levelId: "grade-10", trackId: "7a0b6f2a-3f3b-4c9d-8e2a-111111111111", groupIds: [],
      timeLimitMinutes: 15,
      parts: [{ id: "p1", position: 1, title: "P", instructions: "", kind: "question_sheet", questions: [{
        id: "q1", position: 1, number: 1, prompt: "x", modelAnswer: "", maxScore: "2.50", excluded: false, excludedAt: null,
        choices: [{ id: "c1", position: 1, label: "A", isCorrect: false }, { id: "c2", position: 2, label: "B", isCorrect: true }],
      }] }],
    } as unknown as Exam;
    const values = examToValues(exam);
    expect(values.parts[0].questions[0]).toMatchObject({ maxScore: "2.5", correct: 1 });
    const result = valuesToDraft(values);
    expect(result).toMatchObject({ audience: "program", timeLimitMinutes: 15 });
    expect(result.parts[0].questions[0].choices).toEqual([{ id: "c1", label: "A", isCorrect: false }, { id: "c2", label: "B", isCorrect: true }]);
  });

  it("starts with no audience and flags invalid fields", () => {
    const values = emptyExamValues();
    expect(valuesToDraft(values).audience).toBeNull();
    expect(formErrors({ ...values, timeLimit: "0" })).toMatchObject({ title: expect.any(String), timeLimit: expect.any(String) });
    expect(formErrors({ ...values, timeLimit: "12.5" })).toMatchObject({ timeLimit: expect.any(String) });
  });

  it("keeps a blank timer as an unfinished draft rather than inventing one", () => {
    const values = { ...emptyExamValues(), timeLimit: " " };
    expect(formErrors(values).timeLimit).toBeUndefined();
    expect(valuesToDraft(values).timeLimitMinutes).toBeNull();
    expect(examToValues({ ...({} as Exam), parts: [], groupIds: [], timeLimitMinutes: null } as Exam).timeLimit).toBe("");
  });
});
