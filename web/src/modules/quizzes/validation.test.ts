import { describe, expect, it } from "vitest";

import { draftIssues, emptyQuizValues, formErrors, isValidQuestionMax, quizDraftSchema, quizToValues, valuesToDraft } from "./validation";
import type { Quiz, QuizDraft } from "./types";

const draft = (change: Partial<QuizDraft> = {}): QuizDraft => ({
  title: "Weekly quiz", instructions: "", solutionNotes: "", audience: "level", levelId: "preparatory-3", trackId: null, groupIds: [], timeLimitMinutes: null,
  parts: [{ title: "P", instructions: "", kind: "question_sheet", questions: [{ prompt: "What is 2 + 2?", modelAnswer: "", maxScore: "2", choices: [{ label: "A", isCorrect: true }, { label: "B", isCorrect: false }] }] }],
  ...change,
});

describe("quizDraftSchema", () => {
  it("accepts incomplete preparation without a target or parts", () => {
    expect(quizDraftSchema.safeParse(draft({ audience: null, levelId: null, parts: [] })).success).toBe(true);
  });

  it("rejects Answer Sheet parts, choices on written work and two correct choices", () => {
    expect(quizDraftSchema.safeParse(draft({ parts: [{ title: "P", instructions: "", kind: "answer_sheet" as never, questions: [] }] })).success).toBe(false);
    expect(quizDraftSchema.safeParse(draft({ parts: [{ title: "P", instructions: "", kind: "written_work", questions: [{ prompt: "", modelAnswer: "", maxScore: "2", choices: [{ label: "A", isCorrect: false }] }] }] })).success).toBe(false);
    const two = draft();
    two.parts[0].questions[0].choices[1].isCorrect = true;
    expect(quizDraftSchema.safeParse(two).success).toBe(false);
  });

  it("allows up to ten images across a question's text and choices", () => {
    const token = "{{image:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa}}";
    const withImages = (count: number) => {
      const value = draft();
      value.parts[0].questions[0].prompt = token.repeat(count - 1);
      value.parts[0].questions[0].choices[0].label = token;
      return value;
    };
    expect(quizDraftSchema.safeParse(withImages(10)).success).toBe(true);
    expect(quizDraftSchema.safeParse(withImages(11)).success).toBe(false);
  });

  it("rejects unsupported precision rather than rounding", () => {
    expect(isValidQuestionMax("2.5")).toBe(true);
    expect(isValidQuestionMax("2.555")).toBe(false);
    expect(isValidQuestionMax("0")).toBe(false);
    expect(isValidQuestionMax("1000.01")).toBe(false);
  });

  it("checks the audience shape", () => {
    expect(quizDraftSchema.safeParse(draft({ audience: "groups", levelId: null, groupIds: [] })).success).toBe(false);
    expect(quizDraftSchema.safeParse(draft({ audience: "program", trackId: null })).success).toBe(false);
  });
});

describe("draftIssues", () => {
  it("mirrors the database readiness rules", () => {
    expect(draftIssues(draft())).toEqual([]);
    expect(draftIssues(draft({ audience: null, levelId: null, parts: [] })).map((issue) => issue.issue)).toEqual(["target", "parts"]);
    const unkeyed = draft();
    unkeyed.parts[0].questions[0].choices = [{ label: "", isCorrect: false }];
    expect(draftIssues(unkeyed).map((issue) => issue.issue)).toEqual(["choices", "correct_choice", "choice_text"]);
    const untitled = draft();
    untitled.parts[0].questions[0].prompt = " ";
    expect(draftIssues(untitled).map((issue) => issue.issue)).toEqual(["prompt"]);
  });
});

describe("form conversion", () => {
  it("round-trips a quiz, keeping ids and the key", () => {
    const quiz = {
      title: "Q", instructions: "", solutionNotes: "", audience: "program", levelId: "secondary-1", trackId: "7a0b6f2a-3f3b-4c9d-8e2a-111111111111", groupIds: [],
      timeLimitMinutes: 15,
      parts: [{ id: "p1", position: 1, title: "P", instructions: "", kind: "question_sheet", questions: [{
        id: "q1", position: 1, number: 1, prompt: "x", modelAnswer: "", maxScore: "2.50", excluded: false, excludedAt: null,
        choices: [{ id: "c1", position: 1, label: "A", isCorrect: false }, { id: "c2", position: 2, label: "B", isCorrect: true }],
      }] }],
    } as unknown as Quiz;
    const values = quizToValues(quiz);
    expect(values.parts[0].questions[0]).toMatchObject({ maxScore: "2.5", choices: [{ isCorrect: false }, { isCorrect: true }] });
    const result = valuesToDraft(values);
    expect(result).toMatchObject({ audience: "program", timeLimitMinutes: 15 });
    expect(result.parts[0].questions[0].choices).toEqual([{ id: "c1", label: "A", isCorrect: false }, { id: "c2", label: "B", isCorrect: true }]);
  });

  it("starts with no audience and flags invalid fields", () => {
    const values = emptyQuizValues();
    expect(valuesToDraft(values).audience).toBeNull();
    expect(formErrors({ ...values, timed: true, timeLimit: "0" })).toMatchObject({ title: expect.any(String), timeLimit: expect.any(String) });
  });
});
