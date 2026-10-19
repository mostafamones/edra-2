import { describe, expect, it } from "vitest";

import { BLANK } from "@/components/shared/assessment/marking/draft";
import { markParts, savedAnswers, toAnswerChanges } from "./answers";
import type { Assignment, AssignmentPart, PartQuestion } from "./types";

const question = (id: string, position: number, maxScore = "1", correct = "c"): PartQuestion => ({
  id, position, prompt: "", maxScore,
  choices: ["a", "b", "c"].map((letter, index) => ({ id: `${id}-${letter}`, position: index + 1, label: "", isCorrect: letter === correct })),
});
const part = (overrides: Partial<AssignmentPart>): AssignmentPart => ({
  id: "p1", position: 1, title: "MCQ", instructions: "", maxScore: "2", kind: "online_questions", issues: [],
  questions: [question("q1", 1), question("q2", 2)], ...overrides,
});
const manual = part({ id: "p2", position: 2, title: "Essay", kind: "file_upload", maxScore: "8", questions: [question("e1", 1, "5"), question("e2", 2, "3")] });
const legacy = part({ id: "p3", position: 3, kind: null, questions: [] });

describe("marking sheet adapter", () => {
  it("maps part kinds to how they are entered", () => {
    const parts = markParts({ parts: [part({}), manual, legacy] } as Assignment);
    expect(parts.map((entry) => entry.entry)).toEqual(["choice", "manual", "total"]);
    expect(parts[0].questions[0].choices[2]).toEqual({ id: "q1-c", position: 3, isCorrect: true });
  });

  it("reads saved answers as a choice id, a blank, or the mark", () => {
    expect(savedAnswers([part({}), manual], [
      { questionId: "q1", partId: "p1", choiceId: "q1-a", score: "0" },
      { questionId: "q2", partId: "p1", choiceId: null, score: "0" },
      { questionId: "e1", partId: "p2", choiceId: null, score: "4.50" },
    ])).toEqual({ q1: "q1-a", q2: BLANK, e1: "4.5" });
  });

  it("sends a letter, a blank, a clear, or a mark as the command takes them", () => {
    expect(toAnswerChanges([
      { questionId: "q1", value: "q1-a" }, { questionId: "q2", value: BLANK }, { questionId: "e1", value: "5" }, { questionId: "e2", value: "" },
    ], [part({}), manual])).toEqual([
      { questionId: "q1", choiceId: "q1-a" }, { questionId: "q2", choiceId: null }, { questionId: "e1", score: "5" }, { questionId: "e2", clear: true },
    ]);
  });
});
