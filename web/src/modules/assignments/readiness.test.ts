import { describe, expect, it } from "vitest";

import { formPartIssues } from "./readiness";
import type { FormPart } from "./validation";

const choices = (correct: number | null) => ["a", "b", "c"].map((label, index) => ({ label, isCorrect: index === correct }));
const part = (overrides: Partial<FormPart>): FormPart => ({ title: "P", instructions: "", kind: "online_questions", maxScore: "", questions: [], ...overrides });
const question = (overrides = {}) => ({ prompt: "2+2?", maxScore: "2", choices: choices(1), ...overrides });

describe("form part readiness", () => {
  it("treats an unconfigured typed part as incomplete, not as zero marks", () => {
    expect(formPartIssues(part({}))).toEqual(["questions"]);
  });

  it("requires prompt, choice text, two choices and a correct choice for online questions", () => {
    expect(formPartIssues(part({ questions: [question()] }))).toEqual([]);
    expect(formPartIssues(part({ questions: [question({ prompt: " " })] }))).toEqual(["prompt"]);
    expect(formPartIssues(part({ questions: [question({ choices: choices(null) })] }))).toEqual(["correct_choice"]);
    expect(formPartIssues(part({ questions: [question({ choices: [{ label: "a", isCorrect: true }] })] }))).toEqual(["choices"]);
    expect(formPartIssues(part({ questions: [question({ choices: [{ label: "", isCorrect: true }, { label: "b", isCorrect: false }] })] }))).toEqual(["choice_text"]);
  });

  it("does not require prompts or choice text for an answer sheet", () => {
    const blank = [{ label: "", isCorrect: true }, { label: "", isCorrect: false }];
    expect(formPartIssues(part({ kind: "answer_sheet", questions: [question({ prompt: "", choices: blank })] }))).toEqual([]);
  });

  it("needs only entries with marks for a file upload", () => {
    expect(formPartIssues(part({ kind: "file_upload", questions: [question({ prompt: "", choices: [] })] }))).toEqual([]);
  });

  it("keeps a legacy part complete only while it has a valid stored maximum", () => {
    expect(formPartIssues(part({ kind: "legacy", maxScore: "10" }))).toEqual([]);
    expect(formPartIssues(part({ kind: "legacy", maxScore: "" }))).toEqual(["maximum"]);
  });
});
