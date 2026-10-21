import { describe, expect, it } from "vitest";

import { markBars } from "./analytics";
import type { Assignment, AssignmentPart, PartQuestion, StudentWork } from "./types";

const question = (id: string, position: number, maxScore = "1", correct = "c"): PartQuestion => ({
  id, position, prompt: "", maxScore,
  choices: ["a", "b", "c"].map((letter, index) => ({ id: `${id}-${letter}`, position: index + 1, label: "", isCorrect: letter === correct })),
});
const part = (overrides: Partial<AssignmentPart>): AssignmentPart => ({
  id: "p1", position: 1, title: "MCQ", instructions: "", maxScore: "2", kind: "online_questions", issues: [],
  questions: [question("q1", 1), question("q2", 2)], ...overrides,
});
const manual = part({ id: "p2", position: 2, title: "Essay", kind: "file_upload", maxScore: "8", questions: [question("e1", 1, "5"), question("e2", 2, "3")] });

describe("mark analytics", () => {
  const assignment = { parts: [part({}), manual] } as Assignment;
  const student = (marks: StudentWork["marks"], answers: StudentWork["answers"]) => ({ marks, answers }) as StudentWork;

  it("counts fast marks for parts only and leaves excused marks out", () => {
    const students = [
      student([{ partId: "p1", kind: "mark", score: "2", reason: null, fromAnswers: true }], [
        { questionId: "q1", partId: "p1", choiceId: "q1-c", score: "1" }, { questionId: "q2", partId: "p1", choiceId: "q2-c", score: "1" },
      ]),
      student([{ partId: "p1", kind: "mark", score: "1", reason: null, fromAnswers: true }], [
        { questionId: "q1", partId: "p1", choiceId: "q1-c", score: "1" }, { questionId: "q2", partId: "p1", choiceId: null, score: "0" },
      ]),
      // Fast marked: counts for its parts, not for questions.
      student([{ partId: "p1", kind: "mark", score: "0", reason: null, fromAnswers: false }, { partId: "p2", kind: "mark", score: "8", reason: null, fromAnswers: false }], []),
      // Excused: not a score.
      student([{ partId: "p2", kind: "excused", score: "0", reason: "Absent", fromAnswers: false }], []),
    ];
    const { parts, questions } = markBars(assignment, students);
    expect(parts).toEqual([
      { id: "p1", label: "P1", title: "MCQ", percent: 50, count: 3 },
      { id: "p2", label: "P2", title: "Essay", percent: 100, count: 1 },
    ]);
    expect(questions.map((bar) => [bar.label, bar.percent, bar.count])).toEqual([["1.1", 100, 2], ["1.2", 50, 2]]);
  });
});
