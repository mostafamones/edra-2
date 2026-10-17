import { isValidScoreText } from "@/lib/score";
import type { AnswerEdit, MarkPart } from "./types";

/** Questions shown at once in the entry sheet. */
export const ANSWERS_PER_PAGE = 5;

/** The value "left blank" for a choice question in a draft. */
export const BLANK = "blank";

/**
 * A part's answers being entered, by question id: for choice parts a choice id, `BLANK`, or "" (not
 * entered); for manual parts the mark as typed, or "".
 */
export type AnswerDrafts = Record<string, string>;

/** The drafts a part starts from: the saved value of each question. */
export function initialDrafts(part: MarkPart, saved: Record<string, string>): AnswerDrafts {
  return Object.fromEntries(part.questions.map((question) => [question.id, saved[question.id] ?? ""]));
}

/** A manual mark that cannot be saved (out of range or too precise). */
export function invalidMark(text: string, max: string) {
  return text.trim() !== "" && !isValidScoreText(text.trim(), max);
}

/** The edits that turn the saved values into the drafts, and whether any draft is invalid. Locked questions never change. */
export function answerEdits(part: MarkPart, drafts: AnswerDrafts, saved: Record<string, string>): { changes: AnswerEdit[]; invalid: boolean } {
  const changes: AnswerEdit[] = [];
  let invalid = false;
  for (const question of part.questions) {
    if (question.locked) continue;
    const draft = (drafts[question.id] ?? "").trim();
    const before = saved[question.id] ?? "";
    if (part.entry === "choice") {
      if (draft !== before) changes.push({ questionId: question.id, value: draft });
    } else {
      if (invalidMark(draft, question.maxScore)) { invalid = true; continue; }
      if (before !== "" ? draft !== "" && Number(draft) === Number(before) : draft === "") continue;
      changes.push({ questionId: question.id, value: draft });
    }
  }
  return { changes, invalid };
}

/** The part mark the drafts add up to, and how many questions are entered. Choices score from the answer key. */
export function draftTotal(part: MarkPart, drafts: AnswerDrafts): { total: number; entered: number } {
  let total = 0;
  let entered = 0;
  for (const question of part.questions) {
    const draft = (drafts[question.id] ?? "").trim();
    if (draft === "" || question.excluded) continue;
    if (part.entry === "choice") {
      entered++;
      if (question.choices.some((entry) => entry.id === draft && entry.isCorrect)) total += Number(question.maxScore);
    } else if (!invalidMark(draft, question.maxScore)) {
      entered++;
      total += Number(draft);
    }
  }
  return { total: Math.round(total * 100) / 100, entered };
}
