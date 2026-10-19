import { describe, expect, it } from "vitest";

import { sheetPartIssues, sheetTotal, type SheetPart } from "./types";

const question = (change: Partial<SheetPart["questions"][number]> = {}) => ({
  prompt: "Q", modelAnswer: "", maxScore: "2", choices: [{ label: "A", isCorrect: false }, { label: "B", isCorrect: true }], ...change,
});
const part = (change: Partial<SheetPart> = {}): SheetPart => ({ title: "P", instructions: "", kind: "question_sheet", questions: [question()], ...change });

describe("sheetPartIssues", () => {
  it("accepts a keyed question sheet and any written work with questions", () => {
    expect(sheetPartIssues(part())).toEqual([]);
    expect(sheetPartIssues(part({ kind: "written_work", questions: [question({ choices: [] })] }))).toEqual([]);
  });

  it("needs text or an image on every question, whatever the part type", () => {
    expect(sheetPartIssues(part({ kind: "written_work", questions: [question({ prompt: " ", choices: [] })] }))).toEqual(["prompt"]);
  });

  it("names what is missing", () => {
    expect(sheetPartIssues(part({ questions: [] }))).toEqual(["questions"]);
    expect(sheetPartIssues(part({ questions: [question({ choices: [{ label: "", isCorrect: false }] })] }))).toEqual(["choices", "correct_choice", "choice_text"]);
  });
});

describe("sheetTotal", () => {
  it("adds exact decimals and is null while a mark is invalid", () => {
    expect(sheetTotal([part({ questions: [question({ maxScore: "0.1" }), question({ maxScore: "0.2" })] })])).toBe("0.3");
    expect(sheetTotal([part({ questions: [question({ maxScore: "x" })] })])).toBeNull();
  });
});
