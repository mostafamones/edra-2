import { z } from "zod";

import { MAX_QUESTION_IMAGES, questionImageCount } from "@/components/shared/assessment/images/tokens";
import { formatScore, sumScores, toHundredths } from "@/lib/score";
import { QUIZ_AUDIENCES, QUIZ_PART_KINDS, type Quiz, type QuizAudience, type QuizDraft, type QuizIssue, type QuizPartKind } from "./types";

/** Authoring limits, enforced identically by parse_quiz_draft in the database. */
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

const choiceSchema = z.object({ id: z.guid().optional(), label: z.string().max(1000), isCorrect: z.boolean() }).strict();
const questionSchema = z.object({
  id: z.guid().optional(),
  prompt: z.string().max(5000),
  modelAnswer: z.string().max(10000),
  maxScore: z.string().refine(isValidQuestionMax, MAX_SCORE_MESSAGE),
  choices: z.array(choiceSchema).max(MAX_CHOICES),
}).strict();
const partSchema = z.object({
  id: z.guid().optional(),
  title: z.string().trim().min(1).max(200),
  instructions: z.string().max(5000),
  kind: z.enum(QUIZ_PART_KINDS),
  questions: z.array(questionSchema).max(MAX_QUESTIONS_PER_PART),
}).strict().superRefine((part, context) => {
  part.questions.forEach((question, index) => {
    if (part.kind === "written_work" && question.choices.length > 0) {
      context.addIssue({ code: "custom", path: ["questions", index, "choices"], message: "Written Work questions have no choices." });
    }
    if (questionImageCount(question) > MAX_QUESTION_IMAGES) {
      context.addIssue({ code: "custom", path: ["questions", index, "prompt"], message: `A question can have at most ${MAX_QUESTION_IMAGES} images.` });
    }
    if (question.choices.filter((choice) => choice.isCorrect).length > 1) {
      context.addIssue({ code: "custom", path: ["questions", index, "choices"], message: "Choose a single correct answer." });
    }
  });
});

/** The preparation document accepted at the trust boundary. Completeness is not required: drafts may be unfinished. */
export const quizDraftSchema = z.object({
  title: z.string().trim().min(1).max(200),
  instructions: z.string().max(10000),
  solutionNotes: z.string().max(10000),
  audience: z.enum(QUIZ_AUDIENCES).nullable(),
  levelId: z.string().min(1).max(40).nullable(),
  trackId: z.guid().nullable(),
  groupIds: z.array(z.guid()).max(MAX_AUDIENCE_GROUPS),
  timeLimitMinutes: z.number().int().min(1).max(MAX_TIME_LIMIT).nullable(),
  parts: z.array(partSchema).max(MAX_PARTS),
}).strict().superRefine((draft, context) => {
  if (draft.audience === null && (draft.levelId || draft.trackId || draft.groupIds.length > 0)) {
    context.addIssue({ code: "custom", path: ["audience"], message: "Choose who the quiz is for." });
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
  if (questions.length > MAX_QUESTIONS) context.addIssue({ code: "custom", path: ["parts"], message: `A quiz can have at most ${MAX_QUESTIONS} questions.` });
  if (!ids(draft.parts.map((part) => part.id)) || !ids(questions.map((question) => question.id))
    || !ids(questions.flatMap((question) => question.choices.map((choice) => choice.id)))) {
    context.addIssue({ code: "custom", path: ["parts"], message: "Parts, questions and choices must be distinct." });
  }
});

/** Readiness as the database derives it, for editor feedback. The database decides. */
export function draftIssues(draft: QuizDraft): Omit<QuizIssue, "id">[] {
  const issues: Omit<QuizIssue, "id">[] = [];
  if (draft.audience === null) issues.push({ scope: "quiz", issue: "target" });
  if (draft.parts.length === 0) issues.push({ scope: "quiz", issue: "parts" });
  for (const part of draft.parts) {
    if (part.questions.length === 0) issues.push({ scope: "part", issue: "questions" });
    for (const question of part.questions) {
      if (question.prompt.trim() === "") issues.push({ scope: "question", issue: "prompt" });
    }
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
export function draftMaximum(draft: Pick<QuizDraft, "parts">): string | null {
  return sumScores(draft.parts.flatMap((part) => part.questions.map((question) => question.maxScore)));
}

// ---------------------------------------------------------------------------------------------
// Form values: strings for every input, converted to a draft on submit.

export type FormQuestion = {
  id?: string;
  prompt: string;
  modelAnswer: string;
  maxScore: string;
  /** Question Sheet only; exactly one choice may be correct. */
  choices: { id?: string; label: string; isCorrect: boolean }[];
};
export type FormPart = { id?: string; title: string; instructions: string; kind: QuizPartKind; questions: FormQuestion[] };
export type QuizFormValues = {
  title: string;
  instructions: string;
  solutionNotes: string;
  /** "" while no audience is chosen. */
  audience: "" | QuizAudience;
  levelId: string;
  trackId: string;
  groupIds: string[];
  timed: boolean;
  timeLimit: string;
  parts: FormPart[];
};

export const newPart = (kind: QuizPartKind, position: number): FormPart => ({
  title: `Part ${position}`, instructions: "", kind, questions: [],
});

export const emptyQuizValues = (): QuizFormValues => ({
  title: "", instructions: "", solutionNotes: "", audience: "", levelId: "", trackId: "", groupIds: [], timed: false, timeLimit: "20",
  parts: [newPart("question_sheet", 1)],
});

export function quizToValues(quiz: Quiz): QuizFormValues {
  return {
    title: quiz.title,
    instructions: quiz.instructions,
    solutionNotes: quiz.solutionNotes,
    audience: quiz.audience ?? "",
    levelId: quiz.levelId ?? "",
    trackId: quiz.trackId ?? "",
    groupIds: quiz.groupIds,
    timed: quiz.timeLimitMinutes !== null,
    timeLimit: String(quiz.timeLimitMinutes ?? 20),
    parts: quiz.parts.map((part) => ({
      id: part.id, title: part.title, instructions: part.instructions, kind: part.kind,
      questions: part.questions.map((question) => ({
        id: question.id, prompt: question.prompt, modelAnswer: question.modelAnswer, maxScore: formatScore(question.maxScore),
        choices: question.choices.map((choice) => ({ id: choice.id, label: choice.label, isCorrect: choice.isCorrect })),
      })),
    })),
  };
}

export function valuesToDraft(values: QuizFormValues): QuizDraft {
  const audience = values.audience === "" ? null : values.audience === "groups" ? "groups" : values.trackId ? "program" : "level";
  return {
    title: values.title.trim(),
    instructions: values.instructions,
    solutionNotes: values.solutionNotes,
    audience,
    levelId: audience === "level" || audience === "program" ? values.levelId || null : null,
    trackId: audience === "program" ? values.trackId || null : null,
    groupIds: audience === "groups" ? values.groupIds : [],
    timeLimitMinutes: values.timed ? Number.parseInt(values.timeLimit, 10) : null,
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
          ? question.choices.map((choice) => ({ ...(choice.id ? { id: choice.id } : {}), label: choice.label, isCorrect: choice.isCorrect }))
          : [],
      })),
    })),
  };
}

/** The form's own checks, before the draft schema: one message per field path. */
export function formErrors(values: QuizFormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!values.title.trim()) errors.title = "Enter a title.";
  if ((values.audience === "level" || values.audience === "program") && !values.levelId) errors.levelId = "Choose a level.";
  if (values.audience === "groups" && values.groupIds.length === 0) errors.groupIds = "Choose at least one group.";
  if (values.timed) {
    const minutes = Number(values.timeLimit);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_TIME_LIMIT) errors.timeLimit = `Enter whole minutes from 1 to ${MAX_TIME_LIMIT}.`;
  }
  if (values.parts.length > MAX_PARTS) errors.parts = `A quiz can have at most ${MAX_PARTS} parts.`;
  values.parts.forEach((part, partIndex) => {
    if (!part.title.trim()) errors[`parts.${partIndex}.title`] = "Enter a part title.";
    part.questions.forEach((question, questionIndex) => {
      if (!isValidQuestionMax(question.maxScore)) errors[`parts.${partIndex}.questions.${questionIndex}.maxScore`] = MAX_SCORE_MESSAGE;
    });
  });
  return errors;
}
