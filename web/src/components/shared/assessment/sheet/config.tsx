import { ImageTextField } from "../images/field";
import { MAX_QUESTION_IMAGES, questionImageCount } from "../images/tokens";
import { choiceIssues, type KindSpec, type PartsConfig } from "../parts/config";
import { SHEET_KIND_ICONS, sheetPartMax, type SheetKind, type SheetPart } from "./types";

type Options = {
  kindLabels: Record<SheetKind, string>;
  kindHints: Record<SheetKind, string>;
  maxQuestions: number;
  maxChoices: number;
};

const letter = (index: number) => String.fromCharCode(65 + index);
const blank = (kind: KindSpec) => (kind.choices ? Array.from({ length: 4 }, (_, index) => ({ label: letter(index), isCorrect: false })) : []);

/**
 * The part editor's configuration for quizzes and exams: a Question Sheet (choices, one correct answer)
 * and Written Work (marked by hand), questions one at a time, shown read-only once the structure locks.
 */
export function sheetParts({ kindLabels, kindHints, maxQuestions, maxChoices }: Options): PartsConfig {
  return {
    kinds: (Object.keys(kindLabels) as SheetKind[]).map((value) => ({
      value, label: kindLabels[value], hint: kindHints[value], icon: SHEET_KIND_ICONS[value], layout: "pager", choices: value === "question_sheet", unit: "question",
    })),
    maxQuestions, maxChoices,
    total: (part) => sheetPartMax(part as SheetPart),
    blankChoices: blank,
    newChoice: (index) => ({ label: letter(index), isCorrect: false }),
    blankQuestion: (kind, maxScore) => ({ prompt: "", modelAnswer: "", maxScore, choices: blank(kind) }),
    questionIssues: (question, kind) => [...(question.prompt.trim() === "" ? ["Add the question text or an image."] : []), ...(kind.choices ? choiceIssues(question) : [])],
    promptPlaceholder: "Question text, or paste an image",
    TextField: ImageTextField,
    imageRoom: (question) => MAX_QUESTION_IMAGES - questionImageCount(question),
    lockedView: "readonly",
  };
}
