import { describe, expect, it } from "vitest";

import { sheetPartIssues, sheetTotal, type SheetPart } from "./types";

const question = (change: Partial<SheetPart["questions"][number]> = {}) => ({
  prompt: "", modelAnswer: "", maxScore: "2", correct: 1, choices: [{ label: "A" }, { label: "B" }], ...change,
});
const part = (change: Partial<SheetPart> = {}): SheetPart => ({ title: "P", instructions: "", kind: "question_sheet", questions: [question()], ...change });

describe("sheetPartIssues", () => {
  it("accepts a keyed question sheet and any written work with questions", () => {
    expect(sheetPartIssues(part())).toEqual([]);
    expect(sheetPartIssues(part({ kind: "written_work", questions: [question({ choices: [], correct: -1 })] }))).toEqual([]);
  });

  it("names what is missing", () => {
    expect(sheetPartIssues(part({ questions: [] }))).toEqual(["questions"]);
    expect(sheetPartIssues(part({ questions: [question({ choices: [{ label: "" }], correct: -1 })] }))).toEqual(["choices", "correct_choice", "choice_text"]);
  });
});

describe("sheetTotal", () => {
  it("adds exact decimals and is null while a mark is invalid", () => {
    expect(sheetTotal([part({ questions: [question({ maxScore: "0.1" }), question({ maxScore: "0.2" })] })])).toBe("0.3");
    expect(sheetTotal([part({ questions: [question({ maxScore: "x" })] })])).toBeNull();
  });
});
