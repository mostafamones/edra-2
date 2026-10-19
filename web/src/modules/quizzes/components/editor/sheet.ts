import { detachDraft } from "@/components/shared/assessment/authoring";
import { sheetParts } from "@/components/shared/assessment/sheet/config";
import { SHEET_KIND_ICONS, type SheetPart } from "@/components/shared/assessment/sheet/types";
import { MAX_CHOICES, MAX_QUESTIONS_PER_PART } from "../../validation";
import { QUIZ_PART_KINDS } from "../../types";
import { KIND_HINTS, KIND_LABELS } from "../shared/labels";

/** What the shared part editor needs to know about quizzes. */
export const PARTS = sheetParts({ kindLabels: KIND_LABELS, kindHints: KIND_HINTS, maxQuestions: MAX_QUESTIONS_PER_PART, maxChoices: MAX_CHOICES });

/** The part types an author can add. */
export const KINDS = QUIZ_PART_KINDS.map((value) => ({ value, label: KIND_LABELS[value], icon: SHEET_KIND_ICONS[value] }));

/** A part without stored ids, so it saves as a new part (an autosave may already have removed the original). */
export const detach = <P extends SheetPart>(part: P): P => detachDraft(part);
