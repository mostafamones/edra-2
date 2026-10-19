import { describe, expect, it } from "vitest";

import { answerEdits, BLANK, draftTotal, initialDrafts } from "./draft";
import type { MarkPart, MarkQuestion } from "./types";

const question = (id: string, maxScore = "1", extra: Partial<MarkQuestion> = {}): MarkQuestion => ({
  id, position: 1, maxScore, choices: ["a", "b", "c"].map((letter, index) => ({ id: `${id}-${letter}`, position: index + 1, isCorrect: letter === "c" })), ...extra,
});
const part = (entry: MarkPart["entry"], questions: MarkQuestion[]): MarkPart => ({ id: "p", position: 1, title: "Part", maxScore: "10", entry, questions });
const choice = part("choice", [question("q1"), question("q2")]);
const manual = part("manual", [question("e1", "5"), question("e2", "3")]);

describe("answer entry", () => {
  it("starts from the saved values, with unentered questions empty", () => {
    expect(initialDrafts(choice, { q1: BLANK })).toEqual({ q1: BLANK, q2: "" });
  });

  it("sends only what changed", () => {
    expect(answerEdits(choice, { q1: "q1-a", q2: "" }, { q1: "q1-a" }).changes).toEqual([]);
    expect(answerEdits(choice, { q1: "", q2: BLANK }, { q1: "q1-a" }).changes).toEqual([
      { questionId: "q1", value: "" }, { questionId: "q2", value: BLANK },
    ]);
    expect(answerEdits(manual, { e1: "5", e2: "" }, {}).changes).toEqual([{ questionId: "e1", value: "5" }]);
    expect(answerEdits(manual, { e1: "5.0", e2: "" }, { e1: "5" }).changes).toEqual([]);
  });

  it("never changes a locked question", () => {
    const locked = part("choice", [question("q1", "1", { locked: true })]);
    expect(answerEdits(locked, { q1: "q1-a" }, {}).changes).toEqual([]);
  });

  it("flags a manual mark above the question's maximum", () => {
    expect(answerEdits(manual, { e1: "6", e2: "" }, {})).toEqual({ changes: [], invalid: true });
  });

  it("totals choices from the key and manual marks as typed, leaving excluded questions out", () => {
    expect(draftTotal(choice, { q1: "q1-c", q2: "q2-a" })).toEqual({ total: 1, entered: 2 });
    expect(draftTotal(choice, { q1: BLANK, q2: "" })).toEqual({ total: 0, entered: 1 });
    expect(draftTotal(manual, { e1: "2.5", e2: "3" })).toEqual({ total: 5.5, entered: 2 });
    expect(draftTotal(part("manual", [question("e1", "5", { excluded: true, locked: true })]), { e1: "5" })).toEqual({ total: 0, entered: 0 });
  });
});
