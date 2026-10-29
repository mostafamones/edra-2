import "server-only";

import { z } from "zod";

import { cookieAuthority, type Authority } from "@/lib/supabase/authority";
import { academyMember } from "@/lib/supabase/membership";
import type { Json } from "@/lib/supabase/database.types";
import { failure, failureFromDatabase } from "./errors";
import { toAnnounce, toCorrection, toQuiz, toQuizPage, toStudentCommand, toStudentDetail, toStudentList } from "./mapper";
import {
  QUIZ_AUDIENCES, QUIZ_PHASES, type AnnounceResult, type Quiz, type QuizDraft, type QuizResult, type QuizStudent, type QuizSummary,
  type ReadResult, type StudentDetail, type StudentWorkResult,
} from "./types";
import { MAX_AUDIENCE_GROUPS, quizDraftSchema } from "./validation";

/**
 * Quiz domain operations shared by staff web actions and the external API. Every operation runs as
 * the caller (RLS active) and the database re-checks identity, live role, suspension, year, archive,
 * locks, window and versions inside one transaction. Pass `authority` for token-authenticated
 * requests; it defaults to the request's cookie session.
 */

type DatabaseError = { code?: string; message?: string; details?: string };

function draftJson(draft: QuizDraft): Json {
  return {
    title: draft.title,
    instructions: draft.instructions,
    solution_notes: draft.solutionNotes,
    audience: draft.audience,
    level_id: draft.levelId,
    track_id: draft.trackId,
    group_ids: draft.groupIds,
    time_limit_minutes: draft.timeLimitMinutes,
    parts: draft.parts.map((part) => ({
      ...(part.id ? { id: part.id } : {}), title: part.title, instructions: part.instructions, kind: part.kind,
      questions: part.questions.map((question) => ({
        ...(question.id ? { id: question.id } : {}), prompt: question.prompt, model_answer: question.modelAnswer, max_score: question.maxScore,
        choices: question.choices.map((choice) => ({ ...(choice.id ? { id: choice.id } : {}), label: choice.label, is_correct: choice.isCorrect })),
      })),
    })),
  };
}

async function quizCommand(run: () => PromiseLike<{ data: unknown; error: DatabaseError | null }>, parse: (value: unknown) => Quiz = toQuiz): Promise<QuizResult> {
  try {
    const { data, error } = await run();
    if (error) return failureFromDatabase(error);
    return { ok: true, quiz: parse(data) };
  } catch {
    return failure("unavailable");
  }
}

async function studentCommand(run: () => PromiseLike<{ data: unknown; error: DatabaseError | null }>): Promise<StudentWorkResult> {
  try {
    const { data, error } = await run();
    if (error) return failureFromDatabase(error);
    return { ok: true, ...toStudentCommand(data) };
  } catch {
    return failure("unavailable");
  }
}

// ---------------------------------------------------------------------------------------------
// Preparation and availability.

const createInput = z.object({ academyId: z.guid(), academicYearId: z.guid(), quizId: z.guid(), draft: quizDraftSchema });

/** Creates a quiz (preparation may be incomplete). `quizId` is generated per create action and reused on retry. */
export async function createQuiz(input: z.input<typeof createInput>, authority?: Authority | null): Promise<QuizResult> {
  const parsed = createInput.safeParse(input);
  if (!parsed.success) return failure("validation");
  const { academyId, academicYearId, quizId, draft } = parsed.data;
  if (draft.parts.some((part) => part.id || part.questions.some((question) => question.id || question.choices.some((choice) => choice.id)))) {
    return failure("validation");
  }
  const caller = await academyMember(academyId, authority);
  if (!caller) return failure("forbidden");
  return quizCommand(() => caller.db.rpc("create_quiz", {
    p_academy_id: academyId, p_academic_year_id: academicYearId, p_quiz_id: quizId, p_draft: draftJson(draft),
  }));
}

const updateInput = z.object({
  academyId: z.guid(), quizId: z.guid(), expectedVersion: z.number().int().min(1), draft: quizDraftSchema,
  availability: z.object({
    opensAt: z.iso.datetime({ offset: true }).nullable(), closesAt: z.iso.datetime({ offset: true }).nullable(),
  }).refine((value) => (value.opensAt === null) === (value.closesAt === null)
    && (value.opensAt === null || Date.parse(value.opensAt) < Date.parse(value.closesAt as string))).optional(),
});

/**
 * Saves preparation against `expectedVersion` (quiz_conflict when stale). The target and timer lock
 * once work begins; the structure locks once answers or marks exist.
 */
export async function updateQuiz(input: z.input<typeof updateInput>, authority?: Authority | null): Promise<QuizResult> {
  const parsed = updateInput.safeParse(input);
  if (!parsed.success) return failure("validation");
  const { academyId, quizId, expectedVersion, draft, availability } = parsed.data;
  const caller = await academyMember(academyId, authority);
  if (!caller) return failure("forbidden");
  if (availability) return quizCommand(() => caller.db.rpc("save_quiz_settings", {
    p_academy_id: academyId, p_quiz_id: quizId, p_expected_version: expectedVersion, p_draft: draftJson(draft),
    p_opens_at: availability.opensAt as string, p_closes_at: availability.closesAt as string,
  }));
  return quizCommand(() => caller.db.rpc("update_quiz", {
    p_academy_id: academyId, p_quiz_id: quizId, p_expected_version: expectedVersion, p_draft: draftJson(draft),
  }));
}

const availabilityInput = z.object({
  academyId: z.guid(), quizId: z.guid(), expectedVersion: z.number().int().min(1),
  opensAt: z.iso.datetime({ offset: true }).nullable(), closesAt: z.iso.datetime({ offset: true }).nullable(),
}).refine((value) => (value.opensAt === null) === (value.closesAt === null)
  && (value.opensAt === null || Date.parse(value.opensAt) < Date.parse(value.closesAt as string)));

/** Owner/Head Admin/Admin: sets the opening and scheduled closing times, or clears them before opening. */
export async function configureAvailability(input: z.input<typeof availabilityInput>, authority?: Authority | null): Promise<QuizResult> {
  const parsed = availabilityInput.safeParse(input);
  if (!parsed.success) return failure("validation");
  const { academyId, quizId, expectedVersion, opensAt, closesAt } = parsed.data;
  const caller = await academyMember(academyId, authority);
  if (!caller) return failure("forbidden");
  return quizCommand(() => caller.db.rpc("configure_quiz_availability", {
    p_academy_id: academyId, p_quiz_id: quizId, p_expected_version: expectedVersion,
    p_opens_at: opensAt as string, p_closes_at: closesAt as string,
  }));
}

const archiveInput = z.object({ academyId: z.guid(), quizId: z.guid(), expectedVersion: z.number().int().min(1) });

/** Owner/Head Admin/Admin: archives once no attempt is still running. Work and history stay. */
export async function archiveQuiz(input: z.input<typeof archiveInput>, authority?: Authority | null): Promise<QuizResult> {
  const parsed = archiveInput.safeParse(input);
  if (!parsed.success) return failure("validation");
  const { academyId, quizId, expectedVersion } = parsed.data;
  const caller = await academyMember(academyId, authority);
  if (!caller) return failure("forbidden");
  return quizCommand(() => caller.db.rpc("archive_quiz", { p_academy_id: academyId, p_quiz_id: quizId, p_expected_version: expectedVersion }));
}

// ---------------------------------------------------------------------------------------------
// Corrections (Owner/Head Admin/Admin, after the structure locks).

const correctionInput = z.object({
  academyId: z.guid(), quizId: z.guid(), questionId: z.guid(), expectedScoringRevision: z.number().int().min(1), key: z.guid(),
});

/** Changes a Question Sheet question's correct choice. Results recalculate privately. */
export async function correctKey(input: z.input<typeof correctionInput> & { choiceId: string }, authority?: Authority | null): Promise<QuizResult> {
  const parsed = correctionInput.extend({ choiceId: z.guid() }).safeParse(input);
  if (!parsed.success) return failure("validation");
  const { academyId, quizId, questionId, choiceId, expectedScoringRevision, key } = parsed.data;
  const caller = await academyMember(academyId, authority);
  if (!caller) return failure("forbidden");
  return quizCommand(() => caller.db.rpc("correct_quiz_key", {
    p_academy_id: academyId, p_quiz_id: quizId, p_question_id: questionId, p_choice_id: choiceId,
    p_expected_scoring_revision: expectedScoringRevision, p_key: key,
  }), toCorrection);
}

/** Excludes a question: numbering, answers and marks stay; it no longer counts. Nothing is reinstated. */
export async function excludeQuestion(input: z.input<typeof correctionInput>, authority?: Authority | null): Promise<QuizResult> {
  const parsed = correctionInput.safeParse(input);
  if (!parsed.success) return failure("validation");
  const { academyId, quizId, questionId, expectedScoringRevision, key } = parsed.data;
  const caller = await academyMember(academyId, authority);
  if (!caller) return failure("forbidden");
  return quizCommand(() => caller.db.rpc("exclude_quiz_question", {
    p_academy_id: academyId, p_quiz_id: quizId, p_question_id: questionId, p_expected_scoring_revision: expectedScoringRevision, p_key: key,
  }), toCorrection);
}

// ---------------------------------------------------------------------------------------------
// Physical work, marks and announcement (every staff role).

const draftAnswer = z.object({ questionId: z.guid(), choiceId: z.guid().nullable() }).strict();
const physicalInput = z.object({
  academyId: z.guid(), quizId: z.guid(), recordId: z.guid(), expectedVersion: z.number().int().min(0),
  answers: z.array(draftAnswer).max(300).refine((answers) => new Set(answers.map((answer) => answer.questionId)).size === answers.length),
  key: z.guid(),
});

/** Saves the whole physical draft (transcribed choices) against its version. Never chooses a source or announces. */
export async function savePhysicalDraft(input: z.input<typeof physicalInput>, authority?: Authority | null): Promise<StudentWorkResult> {
  const parsed = physicalInput.safeParse(input);
  if (!parsed.success) return failure("validation");
  const { academyId, quizId, recordId, expectedVersion, answers, key } = parsed.data;
  const caller = await academyMember(academyId, authority);
  if (!caller) return failure("forbidden");
  return studentCommand(() => caller.db.rpc("save_quiz_physical_draft", {
    p_academy_id: academyId, p_quiz_id: quizId, p_record_id: recordId, p_expected_version: expectedVersion,
    p_answers: answers.map((answer) => ({ question_id: answer.questionId, choice_id: answer.choiceId })), p_key: key,
  }));
}

const confirmInput = z.object({ academyId: z.guid(), quizId: z.guid(), recordId: z.guid(), expectedVersion: z.number().int().min(0), key: z.guid() });

/** Confirms received physical work as the student's accepted submission unless online work was accepted first. */
export async function confirmPhysical(input: z.input<typeof confirmInput>, authority?: Authority | null): Promise<StudentWorkResult> {
  const parsed = confirmInput.safeParse(input);
  if (!parsed.success) return failure("validation");
  const { academyId, quizId, recordId, expectedVersion, key } = parsed.data;
  const caller = await academyMember(academyId, authority);
  if (!caller) return failure("forbidden");
  return studentCommand(() => caller.db.rpc("confirm_quiz_physical", {
    p_academy_id: academyId, p_quiz_id: quizId, p_record_id: recordId, p_expected_version: expectedVersion, p_key: key,
  }));
}

const marksInput = z.object({
  academyId: z.guid(), quizId: z.guid(), recordId: z.guid(), expectedVersion: z.number().int().min(1),
  marks: z.array(z.object({ questionId: z.guid(), score: z.string().max(10).nullable() }).strict()).max(300)
    .refine((marks) => new Set(marks.map((mark) => mark.questionId)).size === marks.length),
  feedback: z.string().max(5000).optional(),
  key: z.guid(),
}).refine((value) => value.marks.length > 0 || value.feedback !== undefined);

/** Saves private Written Work marks and/or feedback on the accepted submission. Blank clears; zero is a mark. */
export async function saveMarks(input: z.input<typeof marksInput>, authority?: Authority | null): Promise<StudentWorkResult> {
  const parsed = marksInput.safeParse(input);
  if (!parsed.success) return failure("validation");
  const { academyId, quizId, recordId, expectedVersion, marks, feedback, key } = parsed.data;
  const caller = await academyMember(academyId, authority);
  if (!caller) return failure("forbidden");
  const changes: Json = {
    ...(marks.length > 0 ? { marks: marks.map((mark) => ({ question_id: mark.questionId, score: mark.score })) } : {}),
    ...(feedback !== undefined ? { feedback } : {}),
  };
  return studentCommand(() => caller.db.rpc("save_quiz_marks", {
    p_academy_id: academyId, p_quiz_id: quizId, p_record_id: recordId, p_expected_version: expectedVersion, p_changes: changes, p_key: key,
  }));
}

const announceInput = z.object({
  academyId: z.guid(), quizId: z.guid(), expectedScoringRevision: z.number().int().min(1), key: z.guid(),
  items: z.array(z.object({ recordId: z.guid(), expectedVersion: z.number().int().min(1) }).strict()).min(1).max(500)
    .refine((items) => new Set(items.map((item) => item.recordId)).size === items.length),
});

/** Announces the selected students' complete results (all-or-nothing validation per batch). */
export async function announceResults(input: z.input<typeof announceInput>, authority?: Authority | null): Promise<AnnounceResult> {
  const parsed = announceInput.safeParse(input);
  if (!parsed.success) return failure("validation");
  const { academyId, quizId, expectedScoringRevision, key, items } = parsed.data;
  const caller = await academyMember(academyId, authority);
  if (!caller) return failure("forbidden");
  try {
    const { data, error } = await caller.db.rpc("announce_quiz_results", {
      p_academy_id: academyId, p_quiz_id: quizId, p_expected_scoring_revision: expectedScoringRevision, p_key: key,
      p_items: items.map((item) => ({ annual_student_record_id: item.recordId, expected_version: item.expectedVersion })),
    });
    if (error) return failureFromDatabase(error);
    return { ok: true, ...toAnnounce(data) };
  } catch {
    return failure("unavailable");
  }
}

// ---------------------------------------------------------------------------------------------
// Reads (each settles due deadline work first).

/** One quiz's staff document, or 404 for unknown and foreign quizzes. */
export async function getQuiz(academyId: string, quizId: string, authority?: Authority | null): Promise<ReadResult<Quiz>> {
  if (!z.guid().safeParse(quizId).success) return { ok: false, status: 400 };
  const caller = await academyMember(academyId, authority);
  if (!caller) return { ok: false, status: 403 };
  try {
    const { data, error } = await caller.db.rpc("get_quiz", { p_academy_id: academyId, p_quiz_id: quizId });
    if (error) return { ok: false, status: 500 };
    if (data === null) return { ok: false, status: 404 };
    return { ok: true, data: toQuiz(data) };
  } catch {
    return { ok: false, status: 500 };
  }
}

const listInput = z.object({
  academyId: z.guid(), academicYearId: z.guid().nullable(), search: z.string().max(200), phase: z.enum(QUIZ_PHASES).nullable(),
  audience: z.enum(QUIZ_AUDIENCES).nullable(), includeArchived: z.boolean(), limit: z.number().int().min(1).max(100), offset: z.number().int().min(0).max(100000),
});
export type QuizListInput = z.input<typeof listInput>;

/** One page of the academy's quizzes with derived phase, newest first. */
export async function listQuizzes(input: Partial<QuizListInput> & { academyId: string }, authority?: Authority | null): Promise<ReadResult<{ total: number; quizzes: QuizSummary[]; serverNow: string }>> {
  const parsed = listInput.safeParse({ academicYearId: null, search: "", phase: null, audience: null, includeArchived: false, limit: 25, offset: 0, ...input });
  if (!parsed.success) return { ok: false, status: 400 };
  const { academyId, academicYearId, search, phase, audience, includeArchived, limit, offset } = parsed.data;
  const caller = await academyMember(academyId, authority);
  if (!caller) return { ok: false, status: 403 };
  try {
    const { data, error } = await caller.db.rpc("list_quizzes", {
      p_academy_id: academyId, p_academic_year_id: academicYearId as string, p_search: search, p_phase: phase as string,
      p_audience: audience as (typeof QUIZ_AUDIENCES)[number], p_include_archived: includeArchived, p_limit: limit, p_offset: offset,
    });
    if (error) return { ok: false, status: error.code === "P0001" && error.message === "validation" ? 400 : 500 };
    if (data === null) return { ok: false, status: 403 };
    return { ok: true, data: toQuizPage(data) };
  } catch {
    return { ok: false, status: 500 };
  }
}

/** The current eligible roster plus every historical participant, with work and result state. */
export async function listStudents(academyId: string, quizId: string, authority?: Authority | null): Promise<ReadResult<{ total: number; students: QuizStudent[] }>> {
  if (!z.guid().safeParse(quizId).success) return { ok: false, status: 400 };
  const caller = await academyMember(academyId, authority);
  if (!caller) return { ok: false, status: 403 };
  try {
    const { data, error } = await caller.db.rpc("list_quiz_students", { p_academy_id: academyId, p_quiz_id: quizId });
    if (error) return { ok: false, status: 500 };
    if (data === null) return { ok: false, status: 404 };
    return { ok: true, data: toStudentList(data) };
  } catch {
    return { ok: false, status: 500 };
  }
}

/** One student's row and per-question detail (answers by source, marks, history). */
export async function getStudent(academyId: string, quizId: string, recordId: string, authority?: Authority | null): Promise<ReadResult<{ student: QuizStudent; detail: StudentDetail }>> {
  if (!z.guid().safeParse(quizId).success || !z.guid().safeParse(recordId).success) return { ok: false, status: 400 };
  const caller = await academyMember(academyId, authority);
  if (!caller) return { ok: false, status: 403 };
  try {
    const { data, error } = await caller.db.rpc("get_quiz_student", { p_academy_id: academyId, p_quiz_id: quizId, p_record_id: recordId });
    if (error) return { ok: false, status: 500 };
    if (data === null) return { ok: false, status: 404 };
    return { ok: true, data: toStudentDetail(data) };
  } catch {
    return { ok: false, status: 500 };
  }
}

const previewInput = z.object({
  academyId: z.guid(), academicYearId: z.guid(), audience: z.enum(QUIZ_AUDIENCES),
  levelId: z.string().min(1).max(40).nullable(), trackId: z.guid().nullable(), groupIds: z.array(z.guid()).max(MAX_AUDIENCE_GROUPS),
});

/** Advisory count of the active students the audience matches now. Eligibility stays live. */
export async function previewAudience(input: z.input<typeof previewInput>, authority?: Authority | null): Promise<ReadResult<{ studentCount: number }>> {
  const parsed = previewInput.safeParse(input);
  if (!parsed.success) return { ok: false, status: 400 };
  const { academyId, academicYearId, audience, levelId, trackId, groupIds } = parsed.data;
  const caller = await academyMember(academyId, authority);
  if (!caller) return { ok: false, status: 403 };
  try {
    const { data, error } = await caller.db.rpc("preview_quiz_audience", {
      p_academy_id: academyId, p_academic_year_id: academicYearId, p_audience: audience,
      p_level_id: levelId as string, p_track_id: trackId as string, p_group_ids: groupIds,
    });
    if (error) return { ok: false, status: 500 };
    return { ok: true, data: { studentCount: z.object({ student_count: z.number().int() }).parse(data).student_count } };
  } catch {
    return { ok: false, status: 500 };
  }
}

/** The academy of a quiz the caller can see (RLS), or null for unknown and foreign quizzes. */
export async function quizAcademy(quizId: string, authority?: Authority | null): Promise<string | null> {
  if (!z.guid().safeParse(quizId).success) return null;
  const caller = authority ?? await cookieAuthority();
  if (!caller) return null;
  const { data, error } = await caller.db.from("quizzes").select("academy_id").eq("id", quizId).maybeSingle();
  if (error) throw error;
  return data?.academy_id ?? null;
}
