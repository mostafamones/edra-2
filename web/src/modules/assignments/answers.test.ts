import { describe, expect, it } from "vitest";

import { markBars } from "./analytics";
import { answerChanges, BLANK, draftTotal, initialDrafts } from "./answers";
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

describe("answer entry", () => {
  it("starts from the saved answers, with blanks and unentered questions told apart", () => {
    expect(initialDrafts(part({}), [{ questionId: "q1", partId: "p1", choiceId: null, score: "0" }])).toEqual({ q1: BLANK, q2: "" });
    expect(initialDrafts(manual, [{ questionId: "e1", partId: "p2", choiceId: null, score: "4.50" }])).toEqual({ e1: "4.5", e2: "" });
  });

  it("sends only what changed: a letter, a blank, a clear, or a mark", () => {
    const saved = [{ questionId: "q1", partId: "p1", choiceId: "q1-a", score: "0" }];
    expect(answerChanges(part({}), { q1: "q1-a", q2: "" }, saved).changes).toEqual([]);
    expect(answerChanges(part({}), { q1: "", q2: BLANK }, saved).changes).toEqual([
      { questionId: "q1", clear: true }, { questionId: "q2", choiceId: null },
    ]);
    expect(answerChanges(manual, { e1: "5", e2: "" }, []).changes).toEqual([{ questionId: "e1", score: "5" }]);
  });

  it("flags a manual mark above the question's maximum", () => {
    expect(answerChanges(manual, { e1: "6", e2: "" }, [])).toEqual({ changes: [], invalid: true });
  });

  it("totals choices from the answer key and manual marks as typed", () => {
    expect(draftTotal(part({}), { q1: "q1-c", q2: "q2-a" })).toEqual({ total: 1, entered: 2 });
    expect(draftTotal(part({}), { q1: BLANK, q2: "" })).toEqual({ total: 0, entered: 1 });
    expect(draftTotal(manual, { e1: "2.5", e2: "3" })).toEqual({ total: 5.5, entered: 2 });
  });
});

describe("mark analytics", () => {
  const assignment = { parts: [part({}), manual] } as Assignment;
  const student = (marks: StudentWork["marks"], answers: StudentWork["answers"]) => ({ marks, answers }) as StudentWork;

  it("averages parts and questions from answers and leaves fast marks out", () => {
    const students = [
      student([{ partId: "p1", kind: "mark", score: "2", reason: null, fromAnswers: true }], [
        { questionId: "q1", partId: "p1", choiceId: "q1-c", score: "1" }, { questionId: "q2", partId: "p1", choiceId: "q2-c", score: "1" },
      ]),
      student([{ partId: "p1", kind: "mark", score: "1", reason: null, fromAnswers: true }], [
        { questionId: "q1", partId: "p1", choiceId: "q1-c", score: "1" }, { questionId: "q2", partId: "p1", choiceId: null, score: "0" },
      ]),
      // Fast marked: counts nowhere.
      student([{ partId: "p1", kind: "mark", score: "0", reason: null, fromAnswers: false }, { partId: "p2", kind: "mark", score: "8", reason: null, fromAnswers: false }], []),
    ];
    const { parts, questions } = markBars(assignment, students);
    expect(parts).toEqual([{ id: "p1", label: "P1", title: "MCQ", percent: 75, count: 2 }]);
    expect(questions.map((bar) => [bar.label, bar.percent, bar.count])).toEqual([["1.1", 100, 2], ["1.2", 50, 2]]);
  });
});
