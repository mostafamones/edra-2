import "server-only";

import { z } from "zod";

import { cookieAuthority, type Authority } from "@/lib/supabase/authority";
import { academyMember } from "@/lib/supabase/membership";
import type { Json } from "@/lib/supabase/database.types";
import { failure, failureFromDatabase } from "./errors";
import { toAnnounce, toCorrection, toExam, toExamPage, toStudentCommand, toStudentDetail, toStudentList } from "./mapper";
import {
  EXAM_AUDIENCES, EXAM_PHASES, type AnnounceResult, type Exam, type ExamDraft, type ExamResult, type ExamStudent, type ExamSummary,
  type ReadResult, type StudentDetail, type StudentWorkResult,
} from "./types";
import { MAX_AUDIENCE_GROUPS, examDraftSchema } from "./validation";

/**
 * Exam domain operations shared by staff web actions and the external API. Every operation runs as
 * the caller (RLS active) and the database re-checks identity, live role, suspension, year, archive,
 * locks, window and versions inside one transaction. Pass `authority` for token-authenticated
 * requests; it defaults to the request's cookie session.
 */

type DatabaseError = { code?: string; message?: string; details?: string };

function draftJson(draft: ExamDraft): Json {
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

async function examCommand(run: () => PromiseLike<{ data: unknown; error: DatabaseError | null }>, parse: (value: unknown) => Exam = toExam): Promise<ExamResult> {
  try {
    const { data, error } = await run();
    if (error) return failureFromDatabase(error);
    return { ok: true, exam: parse(data) };
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

const createInput = z.object({ academyId: z.uuid(), academicYearId: z.uuid(), examId: z.uuid(), draft: examDraftSchema });

/** Creates an exam (preparation may be incomplete). `examId` is generated per create action and reused on retry. */
export async function createExam(input: z.input<typeof createInput>, authority?: Authority | null): Promise<ExamResult> {
  const parsed = createInput.safeParse(input);
  if (!parsed.success) return failure("validation");
  const { academyId, academicYearId, examId, draft } = parsed.data;
  if (draft.parts.some((part) => part.id || part.questions.some((question) => question.id || question.choices.some((choice) => choice.id)))) {
    return failure("validation");
  }
  const caller = await academyMember(academyId, authority);
  if (!caller) return failure("forbidden");
  return examCommand(() => caller.db.rpc("create_exam", {
    p_academy_id: academyId, p_academic_year_id: academicYearId, p_exam_id: examId, p_draft: draftJson(draft),
  }));
}

const updateInput = z.object({ academyId: z.uuid(), examId: z.uuid(), expectedVersion: z.number().int().min(1), draft: examDraftSchema });

/**
 * Saves preparation against `expectedVersion` (exam_conflict when stale). The target and timer lock
 * once work begins; the structure locks once answers or marks exist.
 */
export async function updateExam(input: z.input<typeof updateInput>, authority?: Authority | null): Promise<ExamResult> {
  const parsed = updateInput.safeParse(input);
  if (!parsed.success) return failure("validation");
  const { academyId, examId, expectedVersion, draft } = parsed.data;
  const caller = await academyMember(academyId, authority);
  if (!caller) return failure("forbidden");
  return examCommand(() => caller.db.rpc("update_exam", {
    p_academy_id: academyId, p_exam_id: examId, p_expected_version: expectedVersion, p_draft: draftJson(draft),
  }));
}

const availabilityInput = z.object({
  academyId: z.uuid(), examId: z.uuid(), expectedVersion: z.number().int().min(1),
  opensAt: z.iso.datetime({ offset: true }).nullable(), closesAt: z.iso.datetime({ offset: true }).nullable(),
}).refine((value) => (value.opensAt === null) === (value.closesAt === null)
  && (value.opensAt === null || Date.parse(value.opensAt) < Date.parse(value.closesAt as string)));

/** Owner/Head Admin/Admin: sets the opening and scheduled closing times, or clears them before opening. */
export async function configureAvailability(input: z.input<typeof availabilityInput>, authority?: Authority | null): Promise<ExamResult> {
  const parsed = availabilityInput.safeParse(input);
  if (!parsed.success) return failure("validation");
  const { academyId, examId, expectedVersion, opensAt, closesAt } = parsed.data;
  const caller = await academyMember(academyId, authority);
  if (!caller) return failure("forbidden");
  return examCommand(() => caller.db.rpc("configure_exam_availability", {
    p_academy_id: academyId, p_exam_id: examId, p_expected_version: expectedVersion,
    p_opens_at: opensAt as string, p_closes_at: closesAt as string,
  }));
}

const archiveInput = z.object({ academyId: z.uuid(), examId: z.uuid(), expectedVersion: z.number().int().min(1) });

/** Owner/Head Admin/Admin: archives once no attempt is still running. Work and history stay. */
export async function archiveExam(input: z.input<typeof archiveInput>, authority?: Authority | null): Promise<ExamResult> {
  const parsed = archiveInput.safeParse(input);
  if (!parsed.success) return failure("validation");
  const { academyId, examId, expectedVersion } = parsed.data;
  const caller = await academyMember(academyId, authority);
  if (!caller) return failure("forbidden");
  return examCommand(() => caller.db.rpc("archive_exam", { p_academy_id: academyId, p_exam_id: examId, p_expected_version: expectedVersion }));
}

// ---------------------------------------------------------------------------------------------
// Corrections (Owner/Head Admin/Admin, after the structure locks).

const correctionInput = z.object({
  academyId: z.uuid(), examId: z.uuid(), questionId: z.uuid(), expectedScoringRevision: z.number().int().min(1), key: z.uuid(),
});

/** Changes a Question Sheet question's correct choice. Results recalculate privately. */
export async function correctKey(input: z.input<typeof correctionInput> & { choiceId: string }, authority?: Authority | null): Promise<ExamResult> {
  const parsed = correctionInput.extend({ choiceId: z.uuid() }).safeParse(input);
  if (!parsed.success) return failure("validation");
  const { academyId, examId, questionId, choiceId, expectedScoringRevision, key } = parsed.data;
  const caller = await academyMember(academyId, authority);
  if (!caller) return failure("forbidden");
  return examCommand(() => caller.db.rpc("correct_exam_key", {
    p_academy_id: academyId, p_exam_id: examId, p_question_id: questionId, p_choice_id: choiceId,
    p_expected_scoring_revision: expectedScoringRevision, p_key: key,
  }), toCorrection);
}

/** Excludes a question: numbering, answers and marks stay; it no longer counts. Nothing is reinstated. */
export async function excludeQuestion(input: z.input<typeof correctionInput>, authority?: Authority | null): Promise<ExamResult> {
  const parsed = correctionInput.safeParse(input);
  if (!parsed.success) return failure("validation");
  const { academyId, examId, questionId, expectedScoringRevision, key } = parsed.data;
  const caller = await academyMember(academyId, authority);
  if (!caller) return failure("forbidden");
  return examCommand(() => caller.db.rpc("exclude_exam_question", {
    p_academy_id: academyId, p_exam_id: examId, p_question_id: questionId, p_expected_scoring_revision: expectedScoringRevision, p_key: key,
  }), toCorrection);
}

// ---------------------------------------------------------------------------------------------
// Physical work, marks and announcement (every staff role).

const draftAnswer = z.object({ questionId: z.uuid(), choiceId: z.uuid().nullable() }).strict();
const physicalInput = z.object({
  academyId: z.uuid(), examId: z.uuid(), recordId: z.uuid(), expectedVersion: z.number().int().min(0),
  answers: z.array(draftAnswer).max(300).refine((answers) => new Set(answers.map((answer) => answer.questionId)).size === answers.length),
  key: z.uuid(),
});

/** Saves the whole physical draft (transcribed choices) against its version. Never chooses a source or announces. */
export async function savePhysicalDraft(input: z.input<typeof physicalInput>, authority?: Authority | null): Promise<StudentWorkResult> {
  const parsed = physicalInput.safeParse(input);
  if (!parsed.success) return failure("validation");
  const { academyId, examId, recordId, expectedVersion, answers, key } = parsed.data;
  const caller = await academyMember(academyId, authority);
  if (!caller) return failure("forbidden");
  return studentCommand(() => caller.db.rpc("save_exam_physical_draft", {
    p_academy_id: academyId, p_exam_id: examId, p_record_id: recordId, p_expected_version: expectedVersion,
    p_answers: answers.map((answer) => ({ question_id: answer.questionId, choice_id: answer.choiceId })), p_key: key,
  }));
}

const confirmInput = z.object({ academyId: z.uuid(), examId: z.uuid(), recordId: z.uuid(), expectedVersion: z.number().int().min(0), key: z.uuid() });

/** Confirms received physical work as the student's accepted submission unless online work was accepted first. */
export async function confirmPhysical(input: z.input<typeof confirmInput>, authority?: Authority | null): Promise<StudentWorkResult> {
  const parsed = confirmInput.safeParse(input);
  if (!parsed.success) return failure("validation");
  const { academyId, examId, recordId, expectedVersion, key } = parsed.data;
  const caller = await academyMember(academyId, authority);
  if (!caller) return failure("forbidden");
  return studentCommand(() => caller.db.rpc("confirm_exam_physical", {
    p_academy_id: academyId, p_exam_id: examId, p_record_id: recordId, p_expected_version: expectedVersion, p_key: key,
  }));
}

const marksInput = z.object({
  academyId: z.uuid(), examId: z.uuid(), recordId: z.uuid(), expectedVersion: z.number().int().min(1),
  marks: z.array(z.object({ questionId: z.uuid(), score: z.string().max(10).nullable() }).strict()).max(300)
    .refine((marks) => new Set(marks.map((mark) => mark.questionId)).size === marks.length),
  feedback: z.string().max(5000).optional(),
  key: z.uuid(),
}).refine((value) => value.marks.length > 0 || value.feedback !== undefined);

/** Saves private Written Work marks and/or feedback on the accepted submission. Blank clears; zero is a mark. */
export async function saveMarks(input: z.input<typeof marksInput>, authority?: Authority | null): Promise<StudentWorkResult> {
  const parsed = marksInput.safeParse(input);
  if (!parsed.success) return failure("validation");
  const { academyId, examId, recordId, expectedVersion, marks, feedback, key } = parsed.data;
  const caller = await academyMember(academyId, authority);
  if (!caller) return failure("forbidden");
  const changes: Json = {
    ...(marks.length > 0 ? { marks: marks.map((mark) => ({ question_id: mark.questionId, score: mark.score })) } : {}),
    ...(feedback !== undefined ? { feedback } : {}),
  };
  return studentCommand(() => caller.db.rpc("save_exam_marks", {
    p_academy_id: academyId, p_exam_id: examId, p_record_id: recordId, p_expected_version: expectedVersion, p_changes: changes, p_key: key,
  }));
}

const announceInput = z.object({
  academyId: z.uuid(), examId: z.uuid(), expectedScoringRevision: z.number().int().min(1), key: z.uuid(),
  items: z.array(z.object({ recordId: z.uuid(), expectedVersion: z.number().int().min(1) }).strict()).min(1).max(500)
    .refine((items) => new Set(items.map((item) => item.recordId)).size === items.length),
});

/** Announces the selected students' complete results (all-or-nothing validation per batch). */
export async function announceResults(input: z.input<typeof announceInput>, authority?: Authority | null): Promise<AnnounceResult> {
  const parsed = announceInput.safeParse(input);
  if (!parsed.success) return failure("validation");
  const { academyId, examId, expectedScoringRevision, key, items } = parsed.data;
  const caller = await academyMember(academyId, authority);
  if (!caller) return failure("forbidden");
  try {
    const { data, error } = await caller.db.rpc("announce_exam_results", {
      p_academy_id: academyId, p_exam_id: examId, p_expected_scoring_revision: expectedScoringRevision, p_key: key,
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

/** One exam's staff document, or 404 for unknown and foreign exams. */
export async function getExam(academyId: string, examId: string, authority?: Authority | null): Promise<ReadResult<Exam>> {
  if (!z.uuid().safeParse(examId).success) return { ok: false, status: 400 };
  const caller = await academyMember(academyId, authority);
  if (!caller) return { ok: false, status: 403 };
  try {
    const { data, error } = await caller.db.rpc("get_exam", { p_academy_id: academyId, p_exam_id: examId });
    if (error) return { ok: false, status: 500 };
    if (data === null) return { ok: false, status: 404 };
    return { ok: true, data: toExam(data) };
  } catch {
    return { ok: false, status: 500 };
  }
}

const listInput = z.object({
  academyId: z.uuid(), academicYearId: z.uuid().nullable(), search: z.string().max(200), phase: z.enum(EXAM_PHASES).nullable(),
  audience: z.enum(EXAM_AUDIENCES).nullable(), includeArchived: z.boolean(), limit: z.number().int().min(1).max(100), offset: z.number().int().min(0).max(100000),
});
export type ExamListInput = z.input<typeof listInput>;

/** One page of the academy's exams with derived phase, newest first. */
export async function listExams(input: Partial<ExamListInput> & { academyId: string }, authority?: Authority | null): Promise<ReadResult<{ total: number; exams: ExamSummary[]; serverNow: string }>> {
  const parsed = listInput.safeParse({ academicYearId: null, search: "", phase: null, audience: null, includeArchived: false, limit: 25, offset: 0, ...input });
  if (!parsed.success) return { ok: false, status: 400 };
  const { academyId, academicYearId, search, phase, audience, includeArchived, limit, offset } = parsed.data;
  const caller = await academyMember(academyId, authority);
  if (!caller) return { ok: false, status: 403 };
  try {
    const { data, error } = await caller.db.rpc("list_exams", {
      p_academy_id: academyId, p_academic_year_id: academicYearId as string, p_search: search, p_phase: phase as string,
      p_audience: audience as (typeof EXAM_AUDIENCES)[number], p_include_archived: includeArchived, p_limit: limit, p_offset: offset,
    });
    if (error) return { ok: false, status: error.code === "P0001" && error.message === "validation" ? 400 : 500 };
    if (data === null) return { ok: false, status: 403 };
    return { ok: true, data: toExamPage(data) };
  } catch {
    return { ok: false, status: 500 };
  }
}

/** The current eligible roster plus every historical participant, with work and result state. */
export async function listStudents(academyId: string, examId: string, authority?: Authority | null): Promise<ReadResult<{ total: number; students: ExamStudent[] }>> {
  if (!z.uuid().safeParse(examId).success) return { ok: false, status: 400 };
  const caller = await academyMember(academyId, authority);
  if (!caller) return { ok: false, status: 403 };
  try {
    const { data, error } = await caller.db.rpc("list_exam_students", { p_academy_id: academyId, p_exam_id: examId });
    if (error) return { ok: false, status: 500 };
    if (data === null) return { ok: false, status: 404 };
    return { ok: true, data: toStudentList(data) };
  } catch {
    return { ok: false, status: 500 };
  }
}

/** One student's row and per-question detail (answers by source, marks, history). */
export async function getStudent(academyId: string, examId: string, recordId: string, authority?: Authority | null): Promise<ReadResult<{ student: ExamStudent; detail: StudentDetail }>> {
  if (!z.uuid().safeParse(examId).success || !z.uuid().safeParse(recordId).success) return { ok: false, status: 400 };
  const caller = await academyMember(academyId, authority);
  if (!caller) return { ok: false, status: 403 };
  try {
    const { data, error } = await caller.db.rpc("get_exam_student", { p_academy_id: academyId, p_exam_id: examId, p_record_id: recordId });
    if (error) return { ok: false, status: 500 };
    if (data === null) return { ok: false, status: 404 };
    return { ok: true, data: toStudentDetail(data) };
  } catch {
    return { ok: false, status: 500 };
  }
}

const previewInput = z.object({
  academyId: z.uuid(), academicYearId: z.uuid(), audience: z.enum(EXAM_AUDIENCES),
  levelId: z.string().min(1).max(40).nullable(), trackId: z.uuid().nullable(), groupIds: z.array(z.uuid()).max(MAX_AUDIENCE_GROUPS),
});

/** Advisory count of the active students the audience matches now. Eligibility stays live. */
export async function previewAudience(input: z.input<typeof previewInput>, authority?: Authority | null): Promise<ReadResult<{ studentCount: number }>> {
  const parsed = previewInput.safeParse(input);
  if (!parsed.success) return { ok: false, status: 400 };
  const { academyId, academicYearId, audience, levelId, trackId, groupIds } = parsed.data;
  const caller = await academyMember(academyId, authority);
  if (!caller) return { ok: false, status: 403 };
  try {
    const { data, error } = await caller.db.rpc("preview_exam_audience", {
      p_academy_id: academyId, p_academic_year_id: academicYearId, p_audience: audience,
      p_level_id: levelId as string, p_track_id: trackId as string, p_group_ids: groupIds,
    });
    if (error) return { ok: false, status: 500 };
    return { ok: true, data: { studentCount: z.object({ student_count: z.number().int() }).parse(data).student_count } };
  } catch {
    return { ok: false, status: 500 };
  }
}

/** The academy of an exam the caller can see (RLS), or null for unknown and foreign exams. */
export async function examAcademy(examId: string, authority?: Authority | null): Promise<string | null> {
  if (!z.uuid().safeParse(examId).success) return null;
  const caller = authority ?? await cookieAuthority();
  if (!caller) return null;
  const { data, error } = await caller.db.from("exams").select("academy_id").eq("id", examId).maybeSingle();
  if (error) throw error;
  return data?.academy_id ?? null;
}
