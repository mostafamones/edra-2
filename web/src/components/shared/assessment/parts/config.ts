import type { ComponentType } from "react";
import type { Icon } from "@tabler/icons-react";

/** The editable shape of a question every assessment shares; the stored model answer is carried along untouched. */
export type EditorChoice = { id?: string; label: string; isCorrect: boolean };
export type EditorQuestion = { id?: string; prompt: string; maxScore: string; choices: EditorChoice[]; modelAnswer?: string };
export type EditorPart = { id?: string; title: string; instructions: string; kind: string; maxScore?: string; questions: EditorQuestion[] };

/**
 * `pager`: one question at a time, with numbered jumps. `rows`: numbered entries with a letter per
 * choice and a mark. `ranges`: entries that share a mark, grouped as "1–57 at 1 mark".
 */
export type PartLayout = "pager" | "rows" | "ranges";

export type KindSpec = {
  value: string;
  label: string;
  hint: string;
  icon: Icon;
  layout: PartLayout;
  /** Its questions carry choices with one correct answer. */
  choices: boolean;
  /** What its questions are called. */
  unit: "question" | "entry";
};

export type TextFieldProps = {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  /** Question text wraps and takes line breaks; a choice is a single line. */
  multiline?: boolean;
  /** Images this field may still add; types without images ignore it. */
  room: number;
  readOnly?: boolean;
  id?: string;
  placeholder?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  className?: string;
};

/** What differs between assessment types in the part editor. */
export type PartsConfig = {
  kinds: KindSpec[];
  /** The most questions in one part, and choices in one question. */
  maxQuestions: number;
  maxChoices: number;
  total: (part: EditorPart) => string | null;
  blankChoices: (kind: KindSpec) => EditorChoice[];
  /** A choice added by "Add choice"; `index` is its position. */
  newChoice: (index: number) => EditorChoice;
  blankQuestion: (kind: KindSpec, maxScore: string) => EditorQuestion;
  /** What a question still needs for its type, as short instructions; unfinished questions are flagged in the pager. */
  questionIssues: (question: EditorQuestion, kind: KindSpec) => string[];
  /** Placeholder of the question text. */
  promptPlaceholder: string;
  /** Question text and choices, with images where the type supports them. Plain text by default. */
  TextField?: ComponentType<TextFieldProps>;
  /** Images a question may still take, shared by its text and choices. */
  imageRoom?: (question: EditorQuestion) => number;
  /** With the structure locked: a count (`summary`) or the questions as read-only cards (`readonly`). */
  lockedView: "summary" | "readonly";
};

/** The kind spec of a value; unknown values fall back to the first kind. */
export const kindOf = (config: PartsConfig, value: string): KindSpec => config.kinds.find((kind) => kind.value === value) ?? config.kinds[0];

/** "3 questions", "1 entry". */
export const countLabel = (kind: KindSpec, count: number) => `${count} ${kind.unit === "question" ? (count === 1 ? "question" : "questions") : (count === 1 ? "entry" : "entries")}`;

/** What a question's choices still need: at least two, each with text, and one marked correct. */
export function choiceIssues(question: EditorQuestion): string[] {
  const issues: string[] = [];
  if (question.choices.length < 2) issues.push("Add at least two choices.");
  if (question.choices.some((choice) => choice.label.trim() === "")) issues.push("Fill in every choice.");
  if (!question.choices.some((choice) => choice.isCorrect)) issues.push("Mark the correct answer.");
  return issues;
}
