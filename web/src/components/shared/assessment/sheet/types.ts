import { IconListCheck, IconPencil, type Icon } from "@tabler/icons-react";

import type { PartSummary } from "../parts-list";
import { sumScores } from "@/lib/score";

/**
 * The form shape quizzes and exams share: parts of a Question Sheet (choices, one correct answer, scored
 * automatically) or Written Work (marked by hand). Each module's own form types satisfy these.
 */
export type SheetKind = "question_sheet" | "written_work";
export type SheetQuestion = {
  id?: string;
  prompt: string;
  modelAnswer: string;
  maxScore: string;
  /** Index of the correct choice, or -1 for none. */
  correct: number;
  choices: { id?: string; label: string }[];
};
export type SheetPart = { id?: string; title: string; instructions: string; kind: SheetKind; questions: SheetQuestion[] };
export type SheetValues = { parts: SheetPart[] };

/** What differs between quizzes and exams in the part and question editors. */
export type SheetConfig = {
  /** "quiz" or "exam". */
  noun: string;
  kindLabels: Record<SheetKind, string>;
  kindHints: Record<SheetKind, string>;
  maxQuestionsPerPart: number;
  maxChoices: number;
  choiceLetter: (position: number) => string;
  newQuestion: (kind: SheetKind) => SheetQuestion;
};

export const SHEET_KIND_ICONS: Record<SheetKind, Icon> = { question_sheet: IconListCheck, written_work: IconPencil };

export type SheetIssue = "questions" | "choices" | "correct_choice" | "choice_text";

/** Unresolved configuration of a part, mirroring the database's readiness rules. */
export function sheetPartIssues(part: SheetPart): SheetIssue[] {
  if (part.questions.length === 0) return ["questions"];
  if (part.kind !== "question_sheet") return [];
  const issues: SheetIssue[] = [];
  if (part.questions.some((question) => question.choices.length < 2)) issues.push("choices");
  if (part.questions.some((question) => question.correct < 0 || question.correct >= question.choices.length)) issues.push("correct_choice");
  if (part.questions.some((question) => question.choices.some((choice) => choice.label.trim() === ""))) issues.push("choice_text");
  return issues;
}

/** The part's maximum: the sum of its questions, or null while any is invalid. */
export const sheetPartMax = (part: SheetPart) => sumScores(part.questions.map((question) => question.maxScore.trim()));

/** The total across parts, or null while any maximum is invalid. */
export function sheetTotal(parts: readonly SheetPart[]): string | null {
  const maxima = parts.map(sheetPartMax);
  return maxima.some((max) => max === null) ? null : sumScores(maxima as string[]);
}

/** How a part reads in the parts list and on the review step. */
export function summarizeSheetPart(part: SheetPart, index: number, config: SheetConfig): PartSummary {
  const count = part.questions.length;
  return {
    title: part.title.trim() || `Part ${index + 1}`,
    subtitle: `${config.kindLabels[part.kind]} · ${count} ${count === 1 ? "question" : "questions"}`,
    max: sheetPartMax(part),
    unfinished: sheetPartIssues(part).length > 0,
    icon: SHEET_KIND_ICONS[part.kind],
  };
}
