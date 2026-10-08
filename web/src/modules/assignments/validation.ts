import { z } from "zod";

import { academyDateTime, academyInstant, weekFromNow } from "./due";
import { MAX_QUESTION_IMAGES, questionImageCount } from "./images";
import { isValidMaxScore, MAX_PART_TOTAL, sumScores, toHundredths } from "./score";
import { ASSIGNMENT_AUDIENCES, PART_KINDS, type Assignment, type AssignmentDraft, type DraftPart } from "./types";

export const MAX_PARTS = 50;
export const MAX_AUDIENCE_GROUPS = 100;
export const MAX_QUESTIONS = 100;
export const MAX_CHOICES = 10;
const MAX_SCORE_MESSAGE = "Enter a maximum above 0 and up to 1000, with at most two decimals.";

function checkAudience(
  value: { audience: string; levelId: string | null; trackId: string | null; groupIds: string[] },
  context: z.RefinementCtx,
) {
  if (value.audience === "groups") {
    if (value.groupIds.length === 0) context.addIssue({ code: "custom", path: ["groupIds"], message: "Choose at least one group." });
    if (value.levelId || value.trackId) context.addIssue({ code: "custom", path: ["audience"], message: "A groups audience has no level." });
    return;
  }
  if (value.groupIds.length > 0) context.addIssue({ code: "custom", path: ["audience"], message: "Only a groups audience lists groups." });
  if (!value.levelId) context.addIssue({ code: "custom", path: ["levelId"], message: "Choose a level." });
  if (value.audience === "program" && !value.trackId) context.addIssue({ code: "custom", path: ["trackId"], message: "Choose a track." });
  if (value.audience === "level" && value.trackId) context.addIssue({ code: "custom", path: ["trackId"], message: "An entire level has no track." });
}

const choiceSchema = z.object({
  id: z.uuid().optional(),
  label: z.string().trim().max(500),
  isCorrect: z.boolean(),
}).strict();

const questionSchema = z.object({
  id: z.uuid().optional(),
  prompt: z.string().trim().max(2000),
  maxScore: z.string().refine(isValidMaxScore, MAX_SCORE_MESSAGE),
  choices: z.array(choiceSchema).max(MAX_CHOICES),
}).strict();

const unique = (ids: (string | undefined)[]) => { const set = ids.filter(Boolean); return new Set(set).size === set.length; };

/** The shape rules of a part's scheme, shared by the draft and the form. Completeness is not checked: drafts may be unfinished. */
function checkPart(part: { kind: DraftPart["kind"]; maxScore: string; questions: DraftPart["questions"] }, context: z.RefinementCtx) {
  if (part.kind === null) {
    if (part.questions.length > 0) context.addIssue({ code: "custom", path: ["questions"], message: "A legacy part has no questions." });
    if (!isValidMaxScore(part.maxScore)) context.addIssue({ code: "custom", path: ["maxScore"], message: MAX_SCORE_MESSAGE });
    return;
  }
  if (!unique(part.questions.map((question) => question.id)) || !unique(part.questions.flatMap((question) => question.choices.map((choice) => choice.id)))) {
    context.addIssue({ code: "custom", path: ["questions"], message: "Questions and choices must be distinct." });
  }
  part.questions.forEach((question, index) => {
    if (part.kind === "file_upload" && question.choices.length > 0) {
      context.addIssue({ code: "custom", path: ["questions", index, "choices"], message: "File-upload entries have no choices." });
    }
    if (questionImageCount(question) > MAX_QUESTION_IMAGES) {
      context.addIssue({ code: "custom", path: ["questions", index, "prompt"], message: `A question can have at most ${MAX_QUESTION_IMAGES} images.` });
    }
    if (question.choices.filter((choice) => choice.isCorrect).length > 1) {
      context.addIssue({ code: "custom", path: ["questions", index, "choices"], message: "Choose a single correct answer." });
    }
  });
  const total = sumScores(part.questions.map((question) => question.maxScore));
  if (total !== null && (toHundredths(total) ?? 0) > MAX_PART_TOTAL * 100) {
    context.addIssue({ code: "custom", path: ["questions"], message: `A part can total at most ${MAX_PART_TOTAL} marks.` });
  }
}

const partSchema = z.object({
  id: z.uuid().optional(),
  title: z.string().trim().min(1).max(200),
  instructions: z.string().max(5000),
  kind: z.enum(PART_KINDS).nullable(),
  /** Used only by a legacy (untyped) part; a typed part's maximum is the sum of its questions. */
  maxScore: z.string(),
  questions: z.array(questionSchema).max(MAX_QUESTIONS),
}).strict().superRefine(checkPart);

/** The draft document accepted at the trust boundary (server actions and API). */
export const assignmentDraftSchema = z.object({
  title: z.string().trim().min(1).max(200),
  instructions: z.string().max(10000),
  audience: z.enum(ASSIGNMENT_AUDIENCES),
  levelId: z.string().min(1).max(40).nullable(),
  trackId: z.uuid().nullable(),
  groupIds: z.array(z.uuid()).max(MAX_AUDIENCE_GROUPS).refine((ids) => new Set(ids).size === ids.length),
  dueAt: z.iso.datetime({ offset: true }).nullable(),
  parts: z.array(partSchema).min(1).max(MAX_PARTS)
    .refine((parts) => { const ids = parts.flatMap((part) => part.id ? [part.id] : []); return new Set(ids).size === ids.length; }),
}).strict().superRefine(checkAudience);

// ---------------------------------------------------------------------------------------------
// Form values: strings for every input, converted to a draft on submit.

export type AssignmentFormValues = {
  title: string;
  instructions: string;
  audience: AssignmentDraft["audience"];
  levelId: string;
  trackId: string;
  groupIds: string[];
  /** Academy-local "YYYY-MM-DD", or blank for no due date. */
  dueDate: string;
  /** Academy-local "HH:mm". */
  dueTime: string;
  parts: FormPart[];
};

/** `legacy` is an existing maximum-only part; it is never offered for a new part. */
export type FormPartKind = Exclude<DraftPart["kind"], null> | "legacy";
export type FormPart = {
  id?: string;
  title: string;
  instructions: string;
  kind: FormPartKind;
  /** Legacy parts only. */
  maxScore: string;
  questions: { id?: string; prompt: string; maxScore: string; choices: { id?: string; label: string; isCorrect: boolean }[] }[];
};

export const assignmentFormSchema = z.object({
  title: z.string().trim().min(1, "Enter a title.").max(200, "Use at most 200 characters."),
  instructions: z.string().max(10000, "Use at most 10,000 characters."),
  audience: z.enum(ASSIGNMENT_AUDIENCES),
  levelId: z.string(),
  trackId: z.string(),
  groupIds: z.array(z.string()),
  dueDate: z.string(),
  dueTime: z.string(),
  parts: z.array(z.object({
    id: z.string().optional(),
    title: z.string().trim().min(1, "Name this part.").max(200, "Use at most 200 characters."),
    instructions: z.string().max(5000, "Use at most 5,000 characters."),
    kind: z.enum([...PART_KINDS, "legacy"]),
    maxScore: z.string(),
    questions: z.array(z.object({
      id: z.string().optional(),
      prompt: z.string().trim().max(2000, "Use at most 2,000 characters."),
      maxScore: z.string().trim().refine(isValidMaxScore, MAX_SCORE_MESSAGE),
      choices: z.array(z.object({
        id: z.string().optional(), label: z.string().trim().max(500, "Use at most 500 characters."), isCorrect: z.boolean(),
      })).max(MAX_CHOICES),
    })).max(MAX_QUESTIONS, `Use at most ${MAX_QUESTIONS} questions.`),
  }).superRefine((part, context) => checkPart({ ...part, kind: part.kind === "legacy" ? null : part.kind }, context)))
    .min(1, "Add at least one part.").max(MAX_PARTS, `Use at most ${MAX_PARTS} parts.`),
}).superRefine((value, context) => {
  checkAudience({ ...value, levelId: value.levelId || null, trackId: value.trackId || null }, context);
  if (value.dueDate && !academyInstant(value.dueDate, value.dueTime)) {
    context.addIssue({ code: "custom", path: ["dueTime"], message: "Enter a time such as 23:59." });
  }
}).transform((value): AssignmentDraft => ({
  title: value.title.trim(),
  instructions: value.instructions,
  audience: value.audience,
  levelId: value.audience === "groups" ? null : value.levelId || null,
  trackId: value.audience === "program" ? value.trackId || null : null,
  groupIds: value.audience === "groups" ? value.groupIds : [],
  dueAt: value.dueDate ? academyInstant(value.dueDate, value.dueTime) : null,
  parts: value.parts.map((part): DraftPart => ({
    ...(part.id ? { id: part.id } : {}), title: part.title.trim(), instructions: part.instructions,
    kind: part.kind === "legacy" ? null : part.kind,
    maxScore: part.kind === "legacy" ? part.maxScore.trim() : "0",
    questions: part.kind === "legacy" ? [] : part.questions.map((question) => ({
      ...(question.id ? { id: question.id } : {}), prompt: question.prompt.trim(), maxScore: question.maxScore.trim(),
      choices: part.kind === "file_upload" ? [] : question.choices.map((choice) => ({
        ...(choice.id ? { id: choice.id } : {}), label: choice.label.trim(), isCorrect: choice.isCorrect,
      })),
    })),
  })),
}));

/** A new part; the type is chosen by the author, never defaulted to a legacy part. */
export const newPart = (title: string, kind: Exclude<FormPartKind, "legacy"> = "online_questions"): FormPart => ({
  title, instructions: "", kind, maxScore: "", questions: [],
});

export function assignmentFormDefaults(assignment?: Assignment): AssignmentFormValues {
  if (!assignment) {
    const due = weekFromNow();
    return {
      title: "", instructions: "", audience: "level", levelId: "", trackId: "", groupIds: [],
      dueDate: due.date, dueTime: due.time, parts: [newPart("Part 1")],
    };
  }
  const due = assignment.dueAt ? academyDateTime(assignment.dueAt) : null;
  return {
    title: assignment.title,
    instructions: assignment.instructions,
    audience: assignment.audience,
    levelId: assignment.levelId ?? "",
    trackId: assignment.trackId ?? "",
    groupIds: assignment.groupIds,
    dueDate: due?.date ?? "",
    dueTime: due?.time ?? "23:59",
    parts: assignment.parts.map((part): FormPart => ({
      id: part.id, title: part.title, instructions: part.instructions, kind: part.kind ?? "legacy", maxScore: part.maxScore,
      questions: part.questions.map((question) => ({
        id: question.id, prompt: question.prompt, maxScore: question.maxScore,
        choices: question.choices.map((choice) => ({ id: choice.id, label: choice.label, isCorrect: choice.isCorrect })),
      })),
    })),
  };
}

/** A part's maximum: the question sum of a typed part, the stored maximum of a legacy one; null while any is invalid. */
export function formPartMax(part: Pick<FormPart, "kind" | "maxScore" | "questions">): string | null {
  return part.kind === "legacy" ? sumScores([part.maxScore.trim()]) : sumScores(part.questions.map((question) => question.maxScore.trim()));
}

/** The total maximum of the form's parts, or null while any maximum is invalid. */
export function formMaxScore(parts: readonly Pick<FormPart, "kind" | "maxScore" | "questions">[]): string | null {
  const maxima = parts.map(formPartMax);
  return maxima.some((max) => max === null) ? null : sumScores(maxima as string[]);
}
