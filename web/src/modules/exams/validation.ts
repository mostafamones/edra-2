import { z } from "zod";

import { formatScore, sumScores, toHundredths } from "@/lib/score";
import { EXAM_AUDIENCES, EXAM_PART_KINDS, type Exam, type ExamAudience, type ExamDraft, type ExamIssue, type ExamPartKind } from "./types";

/** Authoring limits, enforced identically by parse_exam_draft in the database. */
export const MAX_PARTS = 20;
export const MAX_QUESTIONS_PER_PART = 200;
export const MAX_QUESTIONS = 300;
export const MAX_CHOICES = 10;
export const MAX_AUDIENCE_GROUPS = 100;
export const MAX_TIME_LIMIT = 600;
const MAX_SCORE_MESSAGE = "Enter marks above 0 and up to 1000, with at most two decimals.";

/** A question maximum: positive, at most 1000, at most two fractional digits. */
export function isValidQuestionMax(value: string): boolean {
  const hundredths = toHundredths(value);
  return hundredths !== null && hundredths > 0 && hundredths <= 100000;
}

const ids = (values: (string | undefined)[]) => { const set = values.filter(Boolean); return new Set(set).size === set.length; };

const choiceSchema = z.object({ id: z.uuid().optional(), label: z.string().max(1000), isCorrect: z.boolean() }).strict();
const questionSchema = z.object({
  id: z.uuid().optional(),
  prompt: z.string().max(5000),
  modelAnswer: z.string().max(10000),
  maxScore: z.string().refine(isValidQuestionMax, MAX_SCORE_MESSAGE),
  choices: z.array(choiceSchema).max(MAX_CHOICES),
}).strict();
const partSchema = z.object({
  id: z.uuid().optional(),
  title: z.string().trim().min(1).max(200),
  instructions: z.string().max(5000),
  kind: z.enum(EXAM_PART_KINDS),
  questions: z.array(questionSchema).max(MAX_QUESTIONS_PER_PART),
}).strict().superRefine((part, context) => {
  part.questions.forEach((question, index) => {
    if (part.kind === "written_work" && question.choices.length > 0) {
      context.addIssue({ code: "custom", path: ["questions", index, "choices"], message: "Written Work questions have no choices." });
    }
    if (question.choices.filter((choice) => choice.isCorrect).length > 1) {
      context.addIssue({ code: "custom", path: ["questions", index, "choices"], message: "Choose a single correct answer." });
    }
  });
});

/** The preparation document accepted at the trust boundary. Completeness is not required: drafts may be unfinished. */
export const examDraftSchema = z.object({
  title: z.string().trim().min(1).max(200),
  instructions: z.string().max(10000),
  solutionNotes: z.string().max(10000),
  audience: z.enum(EXAM_AUDIENCES).nullable(),
  levelId: z.string().min(1).max(40).nullable(),
  trackId: z.uuid().nullable(),
  groupIds: z.array(z.uuid()).max(MAX_AUDIENCE_GROUPS),
  timeLimitMinutes: z.number().int().min(1).max(MAX_TIME_LIMIT).nullable(),
  parts: z.array(partSchema).max(MAX_PARTS),
}).strict().superRefine((draft, context) => {
  if (draft.audience === null && (draft.levelId || draft.trackId || draft.groupIds.length > 0)) {
    context.addIssue({ code: "custom", path: ["audience"], message: "Choose who the exam is for." });
  }
  if (draft.audience === "groups" && (draft.groupIds.length === 0 || draft.levelId || draft.trackId)) {
    context.addIssue({ code: "custom", path: ["groupIds"], message: "Choose at least one group." });
  }
  if ((draft.audience === "level" || draft.audience === "program") && (!draft.levelId || draft.groupIds.length > 0)) {
    context.addIssue({ code: "custom", path: ["levelId"], message: "Choose a level." });
  }
  if (draft.audience === "program" && !draft.trackId) context.addIssue({ code: "custom", path: ["trackId"], message: "Choose a track." });
  if (draft.audience === "level" && draft.trackId) context.addIssue({ code: "custom", path: ["trackId"], message: "An entire level has no track." });
  if (new Set(draft.groupIds).size !== draft.groupIds.length) context.addIssue({ code: "custom", path: ["groupIds"], message: "Groups must be distinct." });
  const questions = draft.parts.flatMap((part) => part.questions);
  if (questions.length > MAX_QUESTIONS) context.addIssue({ code: "custom", path: ["parts"], message: `An exam can have at most ${MAX_QUESTIONS} questions.` });
  if (!ids(draft.parts.map((part) => part.id)) || !ids(questions.map((question) => question.id))
    || !ids(questions.flatMap((question) => question.choices.map((choice) => choice.id)))) {
    context.addIssue({ code: "custom", path: ["parts"], message: "Parts, questions and choices must be distinct." });
  }
});

/** Readiness as the database derives it, for editor feedback. The database decides. */
export function draftIssues(draft: ExamDraft): Omit<ExamIssue, "id">[] {
  const issues: Omit<ExamIssue, "id">[] = [];
  if (draft.audience === null) issues.push({ scope: "exam", issue: "target" });
  if (draft.timeLimitMinutes === null) issues.push({ scope: "exam", issue: "timer" });
  if (draft.parts.length === 0) issues.push({ scope: "exam", issue: "parts" });
  for (const part of draft.parts) {
    if (part.questions.length === 0) issues.push({ scope: "part", issue: "questions" });
    if (part.kind !== "question_sheet") continue;
    for (const question of part.questions) {
      if (question.choices.length < 2) issues.push({ scope: "question", issue: "choices" });
      if (!question.choices.some((choice) => choice.isCorrect)) issues.push({ scope: "question", issue: "correct_choice" });
      if (question.choices.some((choice) => choice.label.trim() === "")) issues.push({ scope: "question", issue: "choice_text" });
    }
  }
  return issues;
}

/** The authored maximum of a draft (exact), or null while a maximum is invalid. */
export function draftMaximum(draft: Pick<ExamDraft, "parts">): string | null {
  return sumScores(draft.parts.flatMap((part) => part.questions.map((question) => question.maxScore)));
}

// ---------------------------------------------------------------------------------------------
// Form values: strings for every input, converted to a draft on submit.

export type FormQuestion = {
  id?: string;
  prompt: string;
  modelAnswer: string;
  maxScore: string;
  /** Index of the correct choice, or -1 for none (Question Sheet only). */
  correct: number;
  choices: { id?: string; label: string }[];
};
export type FormPart = { id?: string; title: string; instructions: string; kind: ExamPartKind; questions: FormQuestion[] };
export type ExamFormValues = {
  title: string;
  instructions: string;
  solutionNotes: string;
  /** "" while no audience is chosen. */
  audience: "" | ExamAudience;
  levelId: string;
  trackId: string;
  groupIds: string[];
  /** Whole minutes; "" while not set (an incomplete draft). Every exam needs it before it is ready. */
  timeLimit: string;
  parts: FormPart[];
};

export const newChoices = (): FormQuestion["choices"] => [{ label: "A" }, { label: "B" }, { label: "C" }, { label: "D" }];
export const newQuestion = (kind: ExamPartKind): FormQuestion => ({
  prompt: "", modelAnswer: "", maxScore: "1", correct: -1, choices: kind === "question_sheet" ? newChoices() : [],
});
export const newPart = (kind: ExamPartKind, position: number): FormPart => ({
  title: kind === "question_sheet" ? `Part ${position} · Questions` : `Part ${position} · Written work`, instructions: "", kind, questions: [newQuestion(kind)],
});

export const emptyExamValues = (): ExamFormValues => ({
  title: "", instructions: "", solutionNotes: "", audience: "", levelId: "", trackId: "", groupIds: [], timeLimit: "60",
  parts: [newPart("question_sheet", 1)],
});

export function examToValues(exam: Exam): ExamFormValues {
  return {
    title: exam.title,
    instructions: exam.instructions,
    solutionNotes: exam.solutionNotes,
    audience: exam.audience ?? "",
    levelId: exam.levelId ?? "",
    trackId: exam.trackId ?? "",
    groupIds: exam.groupIds,
    timeLimit: exam.timeLimitMinutes === null ? "" : String(exam.timeLimitMinutes),
    parts: exam.parts.map((part) => ({
      id: part.id, title: part.title, instructions: part.instructions, kind: part.kind,
      questions: part.questions.map((question) => ({
        id: question.id, prompt: question.prompt, modelAnswer: question.modelAnswer, maxScore: formatScore(question.maxScore),
        correct: question.choices.findIndex((choice) => choice.isCorrect),
        choices: question.choices.map((choice) => ({ id: choice.id, label: choice.label })),
      })),
    })),
  };
}

export function valuesToDraft(values: ExamFormValues): ExamDraft {
  const audience = values.audience === "" ? null : values.audience === "groups" ? "groups" : values.trackId ? "program" : "level";
  return {
    title: values.title.trim(),
    instructions: values.instructions,
    solutionNotes: values.solutionNotes,
    audience,
    levelId: audience === "level" || audience === "program" ? values.levelId || null : null,
    trackId: audience === "program" ? values.trackId || null : null,
    groupIds: audience === "groups" ? values.groupIds : [],
    timeLimitMinutes: values.timeLimit.trim() === "" ? null : Number(values.timeLimit.trim()),
    parts: values.parts.map((part) => ({
      ...(part.id ? { id: part.id } : {}),
      title: part.title.trim(),
      instructions: part.instructions,
      kind: part.kind,
      questions: part.questions.map((question) => ({
        ...(question.id ? { id: question.id } : {}),
        prompt: question.prompt,
        modelAnswer: question.modelAnswer,
        maxScore: question.maxScore.trim(),
        choices: part.kind === "question_sheet"
          ? question.choices.map((choice, index) => ({ ...(choice.id ? { id: choice.id } : {}), label: choice.label, isCorrect: index === question.correct }))
          : [],
      })),
    })),
  };
}

/** The form's own checks, before the draft schema: one message per field path. */
export function formErrors(values: ExamFormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!values.title.trim()) errors.title = "Enter a title.";
  if ((values.audience === "level" || values.audience === "program") && !values.levelId) errors.levelId = "Choose a level.";
  if (values.audience === "groups" && values.groupIds.length === 0) errors.groupIds = "Choose at least one group.";
  if (values.timeLimit.trim() !== "") {
    const minutes = Number(values.timeLimit.trim());
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_TIME_LIMIT) errors.timeLimit = `Enter whole minutes from 1 to ${MAX_TIME_LIMIT}.`;
  }
  if (values.parts.length > MAX_PARTS) errors.parts = `An exam can have at most ${MAX_PARTS} parts.`;
  values.parts.forEach((part, partIndex) => {
    if (!part.title.trim()) errors[`parts.${partIndex}.title`] = "Enter a part title.";
    part.questions.forEach((question, questionIndex) => {
      if (!isValidQuestionMax(question.maxScore)) errors[`parts.${partIndex}.questions.${questionIndex}.maxScore`] = MAX_SCORE_MESSAGE;
    });
  });
  return errors;
}
