import { SHEET_KIND_ICONS, type SheetConfig, type SheetPart } from "@/components/shared/assessment/sheet/types";
import { MAX_CHOICES, MAX_QUESTIONS_PER_PART, newQuestion } from "../../validation";
import { EXAM_PART_KINDS } from "../../types";
import { choiceLetter, KIND_HINTS, KIND_LABELS } from "../shared/labels";

/** What the shared question-sheet editors need to know about exams. */
export const SHEET: SheetConfig = {
  noun: "exam", kindLabels: KIND_LABELS, kindHints: KIND_HINTS, maxQuestionsPerPart: MAX_QUESTIONS_PER_PART, maxChoices: MAX_CHOICES,
  choiceLetter, newQuestion,
};

/** The part types an author can add. */
export const KINDS = EXAM_PART_KINDS.map((value) => ({ value, label: KIND_LABELS[value], icon: SHEET_KIND_ICONS[value] }));

/** A part without stored ids, so it saves as a new part (an autosave may already have removed the original). */
export const detach = <P extends SheetPart>(part: P): P => ({
  ...part, id: undefined,
  questions: part.questions.map((question) => ({ ...question, id: undefined, choices: question.choices.map((choice) => ({ label: choice.label })) })),
});
