import { describe, expect, it } from "vitest";

import { BLANK } from "@/components/shared/assessment/marking/draft";
import type { Exam, ExamStudent, StudentDetail } from "../../types";
import { markParts, savedValues } from "./parts";

const choices = (id: string) => ["a", "b"].map((letter, index) => ({ id: `${id}-${letter}`, position: index + 1, label: letter, isCorrect: index === 1 }));
const question = (id: string, number: number, maxScore: string, excluded = false) => ({
  id, position: number, number, prompt: "", modelAnswer: "", maxScore, excluded, excludedAt: null, choices: choices(id),
});
const exam = {
  parts: [
    { id: "p1", position: 1, title: "Sheet", instructions: "", kind: "question_sheet", questions: [question("q1", 1, "1"), question("q2", 2, "2", true)] },
    { id: "p2", position: 2, title: "Essay", instructions: "", kind: "written_work", questions: [{ ...question("w1", 3, "5"), choices: [] }] },
  ],
} as unknown as Exam;
const student = (submission: object | null) => ({ submission, feedback: "" }) as unknown as ExamStudent;
const detail = (questions: Partial<StudentDetail["questions"][number]>[]) => ({ questions, departures: [], publications: [] }) as unknown as StudentDetail;

describe("exam marking sheet", () => {
  it("shows choice parts as letters and Written Work as marks, with excluded questions out of the part maximum", () => {
    const parts = markParts(exam, student(null), detail([]), { choices: true, marks: true });
    expect(parts.map((part) => [part.entry, part.maxScore])).toEqual([["choice", "1"], ["manual", "5"]]);
    expect(parts[0].questions[1]).toMatchObject({ excluded: true, locked: true, position: 2 });
  });

  it("locks choices once work is accepted, but keeps Written Work marks open", () => {
    const parts = markParts(exam, student({ source: "online" }), detail([]), { choices: false, marks: true });
    expect(parts[0].questions[0].locked).toBe(true);
    expect(parts[1].questions[0].locked).toBe(false);
  });

  it("locks everything when the viewer can neither enter work nor mark", () => {
    const parts = markParts(exam, student(null), detail([]), { choices: false, marks: false });
    expect(parts.flatMap((part) => part.questions).every((entry) => entry.locked)).toBe(true);
  });

  it("starts from the physical draft before work is accepted", () => {
    expect(savedValues(exam, student(null), detail([
      { questionId: "q1", physicalAnswer: { choiceId: "q1-a" } }, { questionId: "q2", physicalAnswer: { choiceId: null } }, { questionId: "w1", mark: null },
    ]))).toEqual({ q1: "q1-a", q2: BLANK });
  });

  it("starts from the accepted answers and marks afterwards, unanswered counting as blank", () => {
    expect(savedValues(exam, student({ source: "physical" }), detail([
      { questionId: "q1", submittedAnswer: { choiceId: "q1-b", textAnswer: null } }, { questionId: "q2", submittedAnswer: null }, { questionId: "w1", mark: "4.50" },
    ]))).toEqual({ q1: "q1-b", q2: BLANK, w1: "4.5" });
  });
});
