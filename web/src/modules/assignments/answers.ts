import { isValidScoreText } from "./score";
import type { AnswerChange, AssignmentPart, StudentAnswer } from "./types";

/** Questions shown at once in the entry sheet. */
export const ANSWERS_PER_PAGE = 5;

/** The value "left blank" for a choice question in a draft. */
export const BLANK = "blank";

/**
 * A part's answers being entered, by question id: for choice parts a choice id, `BLANK`, or "" (not
 * entered); for manual parts the mark as typed, or "".
 */
export type AnswerDrafts = Record<string, string>;

export const isChoicePart = (part: AssignmentPart) => part.kind === "online_questions" || part.kind === "answer_sheet";

/** The drafts a part starts from: the student's saved answers. */
export function initialDrafts(part: AssignmentPart, saved: StudentAnswer[]): AnswerDrafts {
  const choice = isChoicePart(part);
  return Object.fromEntries(part.questions.map((question) => {
    const answer = saved.find((entry) => entry.questionId === question.id);
    if (!answer) return [question.id, ""];
    return [question.id, choice ? answer.choiceId ?? BLANK : String(Number(answer.score))];
  }));
}

/** A manual mark that cannot be saved (out of range or too precise). */
export function invalidMark(text: string, max: string) {
  return text.trim() !== "" && !isValidScoreText(text.trim(), max);
}

/** The changes that turn the saved answers into the drafts, and whether any draft is invalid. */
export function answerChanges(part: AssignmentPart, drafts: AnswerDrafts, saved: StudentAnswer[]): { changes: AnswerChange[]; invalid: boolean } {
  const choice = isChoicePart(part);
  const changes: AnswerChange[] = [];
  let invalid = false;
  for (const question of part.questions) {
    const draft = (drafts[question.id] ?? "").trim();
    const answer = saved.find((entry) => entry.questionId === question.id);
    if (choice) {
      if (draft === (answer ? answer.choiceId ?? BLANK : "")) continue;
      changes.push(draft === "" ? { questionId: question.id, clear: true } : { questionId: question.id, choiceId: draft === BLANK ? null : draft });
    } else {
      if (invalidMark(draft, question.maxScore)) { invalid = true; continue; }
      if (answer ? draft !== "" && Number(draft) === Number(answer.score) : draft === "") continue;
      changes.push(draft === "" ? { questionId: question.id, clear: true } : { questionId: question.id, score: draft });
    }
  }
  return { changes, invalid };
}

/** The part mark the drafts add up to, and how many questions are entered. Choices score from the answer key. */
export function draftTotal(part: AssignmentPart, drafts: AnswerDrafts): { total: number; entered: number } {
  const choice = isChoicePart(part);
  let total = 0;
  let entered = 0;
  for (const question of part.questions) {
    const draft = (drafts[question.id] ?? "").trim();
    if (draft === "") continue;
    if (choice) {
      entered++;
      if (question.choices.some((entry) => entry.id === draft && entry.isCorrect)) total += Number(question.maxScore);
    } else if (!invalidMark(draft, question.maxScore)) {
      entered++;
      total += Number(draft);
    }
  }
  return { total: Math.round(total * 100) / 100, entered };
}
