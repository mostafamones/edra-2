import { plainText } from "@/components/shared/assessment/images/tokens";
import { BLANK } from "@/components/shared/assessment/marking/draft";
import type { AnswerEdit, MarkPart } from "@/components/shared/assessment/marking/types";
import type { AnswerChange, Assignment, AssignmentPart, StudentAnswer } from "./types";

/** Choice parts are entered as a letter per question; file-upload parts take a mark per question. */
export const isChoicePart = (part: AssignmentPart) => part.kind === "online_questions" || part.kind === "answer_sheet";

/** The assignment's parts as the marking sheet shows them. */
export function markParts(assignment: Assignment): MarkPart[] {
  return assignment.parts.map((part) => ({
    id: part.id, position: part.position, title: part.title, maxScore: part.maxScore,
    entry: part.kind === null ? "total" : isChoicePart(part) ? "choice" : "manual",
    questions: part.questions.map((question) => ({
      id: question.id, position: question.position, prompt: plainText(question.prompt), maxScore: question.maxScore,
      choices: question.choices.map((choice) => ({ id: choice.id, position: choice.position, isCorrect: choice.isCorrect })),
    })),
  }));
}

/** The saved value of each question: a choice id or `BLANK` for choice parts, the mark for manual parts. */
export function savedAnswers(parts: AssignmentPart[], answers: StudentAnswer[]): Record<string, string> {
  const choice = new Map(parts.flatMap((part) => part.questions.map((question) => [question.id, isChoicePart(part)] as const)));
  return Object.fromEntries(answers.map((answer) => [answer.questionId, choice.get(answer.questionId) ? answer.choiceId ?? BLANK : String(Number(answer.score))]));
}

/** The sheet's edits as the command takes them: a choice (null = blank), a mark, or a clear. */
export function toAnswerChanges(edits: AnswerEdit[], parts: AssignmentPart[]): AnswerChange[] {
  const choice = new Map(parts.flatMap((part) => part.questions.map((question) => [question.id, isChoicePart(part)] as const)));
  return edits.map(({ questionId, value }) => {
    if (value === "") return { questionId, clear: true };
    return choice.get(questionId) ? { questionId, choiceId: value === BLANK ? null : value } : { questionId, score: value };
  });
}
