import { describe, expect, it } from "vitest";

import { focusScore, focusTarget, matchesFocus } from "./focus";
import type { Assignment, StudentWork } from "./types";

const assignment = {
  parts: [
    { id: "p1", position: 1, title: "Sheet 15", maxScore: "3", questions: [{ id: "q1", position: 1, maxScore: "1" }, { id: "q2", position: 2, maxScore: "2" }] },
    { id: "p2", position: 2, title: "Sheet 16", maxScore: "10", questions: [] },
  ],
} as unknown as Assignment;

const student = (marks: StudentWork["marks"], answers: StudentWork["answers"]) => ({ marks, answers }) as StudentWork;

describe("mark focus", () => {
  it("labels parts and questions like the marks chart", () => {
    expect(focusTarget(assignment, { kind: "question", id: "q2" })).toEqual({ label: "1.2", title: "Question 1.2 · Sheet 15", max: 2 });
    expect(focusTarget(assignment, { kind: "part", id: "p2" })).toEqual({ label: "P2", title: "Part 2 · Sheet 16", max: 10 });
    expect(focusTarget(assignment, { kind: "question", id: "missing" })).toBeNull();
  });

  it("splits answered students into lost and full marks, leaving out the unanswered", () => {
    const wrong = student([], [{ questionId: "q2", partId: "p1", choiceId: "c1", score: "0.5" }]);
    const right = student([], [{ questionId: "q2", partId: "p1", choiceId: "c2", score: "2" }]);
    const unanswered = student([], []);
    const focus = { kind: "question", id: "q2" } as const;
    expect([wrong, right, unanswered].map((row) => matchesFocus(row, { ...focus, outcome: "lost" }, 2))).toEqual([true, false, false]);
    expect([wrong, right, unanswered].map((row) => matchesFocus(row, { ...focus, outcome: "full" }, 2))).toEqual([false, true, false]);
    expect([wrong, right, unanswered].map((row) => matchesFocus(row, { ...focus, outcome: "unmarked" }, 2))).toEqual([false, false, true]);
  });

  it("counts fast part marks but not excused ones", () => {
    const fast = student([{ partId: "p2", kind: "mark", score: "4", reason: null, fromAnswers: false }], []);
    const answered = student([{ partId: "p2", kind: "mark", score: "4", reason: null, fromAnswers: true }], []);
    const excused = student([{ partId: "p2", kind: "excused", score: "0", reason: "Absent", fromAnswers: false }], []);
    expect(focusScore(fast, { kind: "part", id: "p2" })).toBe(4);
    expect(focusScore(answered, { kind: "part", id: "p2" })).toBe(4);
    expect(focusScore(excused, { kind: "part", id: "p2" })).toBeNull();
  });
});
