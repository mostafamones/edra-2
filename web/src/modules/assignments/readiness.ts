import { isValidMaxScore } from "./score";
import type { PartIssue } from "./types";
import type { FormPart } from "./validation";

/**
 * Unresolved configuration of a form part, mirroring the database's part_issues so the review step
 * can say what blocks publishing. The database remains the authority at publication.
 */
export function formPartIssues(part: FormPart): PartIssue[] {
  if (part.kind === "legacy") return isValidMaxScore(part.maxScore) ? [] : ["maximum"];
  if (part.questions.length === 0) return ["questions"];
  const issues: PartIssue[] = [];
  if (part.kind !== "file_upload") {
    if (part.questions.some((question) => question.choices.length < 2)) issues.push("choices");
    if (part.questions.some((question) => !question.choices.some((choice) => choice.isCorrect))) issues.push("correct_choice");
  }
  if (part.kind === "online_questions") {
    if (part.questions.some((question) => question.prompt.trim() === "")) issues.push("prompt");
    if (part.questions.some((question) => question.choices.some((choice) => choice.label.trim() === ""))) issues.push("choice_text");
  }
  return issues;
}
