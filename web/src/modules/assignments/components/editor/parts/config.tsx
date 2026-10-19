import { choiceIssues, type PartsConfig } from "@/components/shared/assessment/parts/config";
import { ImageTextField } from "@/components/shared/assessment/images/field";
import { MAX_QUESTION_IMAGES, questionImageCount } from "@/components/shared/assessment/images/tokens";
import { PART_KINDS, type PartKind } from "../../../types";
import { formPartMax, MAX_CHOICES, MAX_QUESTIONS, type FormPart } from "../../../validation";
import { PART_KIND_HINTS, PART_KIND_ICONS, PART_KIND_LABELS } from "../../shared/labels";

const LAYOUTS = { online_questions: "pager", answer_sheet: "rows", file_upload: "ranges" } as const;

/** What the shared part editor needs to know about assignments: three part types, images in text. */
export const ASSIGNMENT_PARTS: PartsConfig = {
  kinds: PART_KINDS.map((value: PartKind) => ({
    value, label: PART_KIND_LABELS[value], hint: PART_KIND_HINTS[value], icon: PART_KIND_ICONS[value], layout: LAYOUTS[value],
    choices: value !== "file_upload", unit: value === "online_questions" ? "question" : "entry",
  })),
  maxQuestions: MAX_QUESTIONS,
  maxChoices: MAX_CHOICES,
  total: (part) => formPartMax(part as FormPart),
  blankChoices: (kind) => (kind.choices ? Array.from({ length: 4 }, () => ({ label: "", isCorrect: false })) : []),
  newChoice: () => ({ label: "", isCorrect: false }),
  blankQuestion: (kind, maxScore) => ({ prompt: "", maxScore, choices: kind.choices ? Array.from({ length: 4 }, () => ({ label: "", isCorrect: false })) : [] }),
  questionIssues: (question, kind) => (kind.choices ? [...(question.prompt.trim() === "" ? ["Add the question text or an image."] : []), ...choiceIssues(question)] : []),
  promptPlaceholder: "Question text, or paste an image",
  TextField: ImageTextField,
  imageRoom: (question) => MAX_QUESTION_IMAGES - questionImageCount(question),
  lockedView: "summary",
};
