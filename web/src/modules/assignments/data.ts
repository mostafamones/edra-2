import "server-only";

import { z } from "zod";

import { cookieAuthority, type Authority } from "@/lib/supabase/authority";
import { academyMember } from "@/lib/supabase/membership";
import type { Json } from "@/lib/supabase/database.types";
import { failure, failureFromDatabase } from "./errors";
import { toAssignment, toAudiencePreview, toPublish, toSaveMarks, toStudentList, toStudentWork } from "./mapper";
import {
  ASSIGNMENT_ACTIONS, ASSIGNMENT_AUDIENCES, ASSIGNMENT_STATES, WORK_STATUSES, type Assignment, type AssignmentAction, type AssignmentDraft, type AssignmentResult,
  type AudiencePreview, type AnswerChange, type MarkChange, type MarkFilter, type PublishResult, type ReadResult, type SaveMarksResult, type StudentLookup, type StudentWork,
  type WorkResult, type WorkStatus,
} from "./types";
import { assignmentDraftSchema, MAX_AUDIENCE_GROUPS } from "./validation";

/**
 * Assignment domain operations shared by staff web actions and the external API. Every operation
 * runs as the caller (RLS active) and the database re-checks identity, live role, state, version,
 * and the academic year inside one transaction. Pass `authority` for token-authenticated requests;
 * it defaults to the request's cookie session.
 */

function draftJson(draft: AssignmentDraft): Json {
  return {
    title: draft.title,
    instructions: draft.instructions,
    audience: draft.audience,
    level_id: draft.levelId,
    track_id: draft.trackId,
    group_ids: draft.groupIds,
    due_at: draft.dueAt,
    parts: draft.parts.map((part) => ({
      ...(part.id ? { id: part.id } : {}), title: part.title, instructions: part.instructions, kind: part.kind,
      // Only a legacy part supplies its maximum; a typed part's is derived from its questions by the database.
      ...(part.kind === null ? { max_score: part.maxScore } : {}),
      questions: part.questions.map((question) => ({
        ...(question.id ? { id: question.id } : {}), prompt: question.prompt, max_score: question.maxScore,
        choices: question.choices.map((choice) => ({ ...(choice.id ? { id: choice.id } : {}), label: choice.label, is_correct: choice.isCorrect })),
      })),
    })),
  };
}

async function command(run: () => PromiseLike<{ data: unknown; error: { code?: string; message?: string; details?: string } | null }>): Promise<AssignmentResult> {
  try {
    const { data, error } = await run();
    if (error) return failureFromDatabase(error);
    return { ok: true, assignment: toAssignment(data) };
  } catch {
    return failure("unavailable");
  }
}

const createInput = z.object({ academyId: z.uuid(), academicYearId: z.uuid(), assignmentId: z.uuid(), draft: assignmentDraftSchema });

/**
 * Creates an active assignment (no content or due date needed) and snapshots its recipients.
 * `assignmentId` is generated per create action and reused on retry.
 */
export async function createAssignment(input: z.input<typeof createInput>, authority?: Authority | null): Promise<AssignmentResult> {
  const parsed = createInput.safeParse(input);
  if (!parsed.success) return failure("validation");
  const { academyId, academicYearId, assignmentId, draft } = parsed.data;
  if (draft.parts.some((part) => part.id)) return failure("validation");
  const caller = await academyMember(academyId, authority);
  if (!caller) return failure("forbidden");
  return command(() => caller.db.rpc("create_assignment", {
    p_academy_id: academyId, p_academic_year_id: academicYearId, p_assignment_id: assignmentId, p_draft: draftJson(draft),
  }));
}

const updateInput = z.object({ academyId: z.uuid(), assignmentId: z.uuid(), expectedVersion: z.number().int().min(1), draft: assignmentDraftSchema });

/**
 * Saves an edit made against `expectedVersion`; a stale version writes nothing (assignment_conflict).
 * Until marking starts the whole setup is replaced and recipients are refreshed from the audience.
 * Afterwards (or once closed) only Owner/Head Admin/Admin may save, and only text details.
 */
export async function updateAssignment(input: z.input<typeof updateInput>, authority?: Authority | null): Promise<AssignmentResult> {
  const parsed = updateInput.safeParse(input);
  if (!parsed.success) return failure("validation");
  const { academyId, assignmentId, expectedVersion, draft } = parsed.data;
  const caller = await academyMember(academyId, authority);
  if (!caller) return failure("forbidden");
  return command(() => caller.db.rpc("update_assignment", {
    p_academy_id: academyId, p_assignment_id: assignmentId, p_expected_version: expectedVersion, p_draft: draftJson(draft),
  }));
}

const stateInput = z.object({ academyId: z.uuid(), assignmentId: z.uuid(), expectedVersion: z.number().int().min(1), action: z.enum(ASSIGNMENT_ACTIONS) });

/** Owner/Head Admin/Admin lifecycle actions: close, reopen, archive. */
export async function changeAssignmentState(
  input: { academyId: string; assignmentId: string; expectedVersion: number; action: AssignmentAction }, authority?: Authority | null,
): Promise<AssignmentResult> {
  const parsed = stateInput.safeParse(input);
  if (!parsed.success) return failure("validation");
  const { academyId, assignmentId, expectedVersion, action } = parsed.data;
  const caller = await academyMember(academyId, authority);
  if (!caller) return failure("forbidden");
  return command(() => caller.db.rpc("change_assignment_state", {
    p_academy_id: academyId, p_assignment_id: assignmentId, p_expected_version: expectedVersion, p_action: action,
  }));
}

/** One assignment's staff view: structure, maxima, audience, state, and version. */
export async function getAssignment(academyId: string, assignmentId: string, authority?: Authority | null): Promise<ReadResult<Assignment>> {
  if (!z.uuid().safeParse(assignmentId).success) return { ok: false, status: 400 };
  const caller = await academyMember(academyId, authority);
  if (!caller) return { ok: false, status: 403 };
  try {
    const { data, error } = await caller.db.rpc("get_assignment", { p_academy_id: academyId, p_assignment_id: assignmentId });
    if (error) return { ok: false, status: 500 };
    if (data === null) return { ok: false, status: 404 };
    return { ok: true, data: toAssignment(data) };
  } catch {
    return { ok: false, status: 500 };
  }
}

const previewInput = z.object({
  academyId: z.uuid(), academicYearId: z.uuid(), audience: z.enum(ASSIGNMENT_AUDIENCES),
  levelId: z.string().min(1).max(40).nullable(), trackId: z.uuid().nullable(), groupIds: z.array(z.uuid()).max(MAX_AUDIENCE_GROUPS),
});

/** Advisory count of the active students an audience matches now. Saving recomputes it. */
export async function previewAudience(input: z.input<typeof previewInput>, authority?: Authority | null): Promise<ReadResult<AudiencePreview>> {
  const parsed = previewInput.safeParse(input);
  if (!parsed.success) return { ok: false, status: 400 };
  const { academyId, academicYearId, audience, levelId, trackId, groupIds } = parsed.data;
  const caller = await academyMember(academyId, authority);
  if (!caller) return { ok: false, status: 403 };
  try {
    const { data, error } = await caller.db.rpc("preview_assignment_audience", {
      p_academy_id: academyId, p_academic_year_id: academicYearId, p_audience: audience,
      p_level_id: levelId as string, p_track_id: trackId as string, p_group_ids: groupIds,
    });
    if (error) return { ok: false, status: error.code === "P0001" && error.message === "forbidden" ? 403 : 500 };
    return { ok: true, data: toAudiencePreview(data) };
  } catch {
    return { ok: false, status: 500 };
  }
}

// ---------------------------------------------------------------------------------------------
// Marks, recorded work, and result announcement. Any staff member of the academy may use these.

type DatabaseError = { code?: string; message?: string; details?: string };

const markChange = z.object({
  partId: z.uuid(),
  score: z.string().max(10).nullable(),
  excusedReason: z.string().trim().min(1).max(500).optional(),
}).strict();

const answerChange = z.union([
  z.object({ questionId: z.uuid(), choiceId: z.uuid().nullable() }).strict(),
  z.object({ questionId: z.uuid(), score: z.string().max(10) }).strict(),
  z.object({ questionId: z.uuid(), clear: z.literal(true) }).strict(),
]);

const saveInput = z.object({
  academyId: z.uuid(),
  assignmentId: z.uuid(),
  /** Exactly one of recordId (permanent) or code (typed or scanned, resolved inside the transaction). */
  recordId: z.uuid().nullable(),
  code: z.string().trim().min(1).max(40).nullable(),
  /** Code saves only: the recipient the code was resolved to (previewed); the save fails if it now names someone else. */
  expectedRecordId: z.uuid().nullable().optional(),
  expectedVersion: z.number().int().min(1),
  marks: z.array(markChange).max(50),
  answers: z.array(answerChange).max(5000).default([]),
  feedback: z.string().max(5000).optional(),
  /** One key per save action; a retry of the same action reuses it. */
  key: z.uuid(),
}).refine((value) => (value.recordId === null) !== (value.code === null) && (value.marks.length > 0 || value.answers.length > 0 || value.feedback !== undefined)
  && (value.expectedRecordId == null || value.code !== null)
  && new Set(value.marks.map((mark) => mark.partId)).size === value.marks.length
  && new Set(value.answers.map((answer) => answer.questionId)).size === value.answers.length);

/**
 * Saves one student's part marks and/or feedback against their version. A stale version writes
 * nothing and returns the current row (outcome "conflict"). The first ordinary mark records the
 * student's work as submitted in the same transaction.
 */
export async function saveMarks(input: { academyId: string; assignmentId: string; recordId: string | null; code: string | null; expectedRecordId?: string | null; expectedVersion: number; marks: MarkChange[]; answers?: AnswerChange[]; feedback?: string; key: string }, authority?: Authority | null): Promise<SaveMarksResult> {
  const parsed = saveInput.safeParse(input);
  if (!parsed.success) return failure("validation");
  const { academyId, assignmentId, recordId, code, expectedRecordId, expectedVersion, marks, answers, feedback, key } = parsed.data;
  const caller = await academyMember(academyId, authority);
  if (!caller) return failure("forbidden");
  const changes: Json = {
    marks: marks.map((mark) => ({ part_id: mark.partId, score: mark.score, ...(mark.excusedReason ? { excused_reason: mark.excusedReason } : {}) })),
    ...(answers.length > 0 ? {
      answers: answers.map((answer) => ({
        question_id: answer.questionId,
        ...("clear" in answer ? { clear: true } : "score" in answer ? { score: answer.score } : { choice_id: answer.choiceId }),
      })),
    } : {}),
    ...(feedback !== undefined ? { feedback } : {}),
  };
  try {
    const { data, error } = await caller.db.rpc("save_assignment_marks", {
      p_academy_id: academyId, p_assignment_id: assignmentId, p_record_id: recordId as string, p_code: code as string,
      p_expected_version: expectedVersion, p_changes: changes, p_key: key,
      ...(expectedRecordId ? { p_expected_record_id: expectedRecordId } : {}),
    });
    if (error) return failureFromDatabase(error);
    const saved = toSaveMarks(data);
    return saved.outcome === "conflict"
      ? { ok: true, outcome: "conflict", student: saved.student, workRecorded: false, replayed: saved.replayed }
      : { ok: true, outcome: saved.outcome, student: saved.student, workRecorded: saved.workRecorded, replayed: saved.replayed };
  } catch {
    return failure("unavailable");
  }
}

const workInput = z.object({
  academyId: z.uuid(), assignmentId: z.uuid(), recordId: z.uuid(), expectedVersion: z.number().int().min(1),
  status: z.enum(WORK_STATUSES), receivedAt: z.iso.datetime({ offset: true }).nullable(), note: z.string().max(500),
});

/** Records a student's work status (received, late, missing, excused, or cleared). Never inferred from a due date. */
export async function recordWork(
  input: { academyId: string; assignmentId: string; recordId: string; expectedVersion: number; status: WorkStatus; receivedAt: string | null; note: string },
  authority?: Authority | null,
): Promise<WorkResult> {
  const parsed = workInput.safeParse(input);
  if (!parsed.success) return failure("validation");
  const { academyId, assignmentId, recordId, expectedVersion, status, receivedAt, note } = parsed.data;
  const caller = await academyMember(academyId, authority);
  if (!caller) return failure("forbidden");
  try {
    const { data, error } = await caller.db.rpc("record_assignment_work", {
      p_academy_id: academyId, p_assignment_id: assignmentId, p_record_id: recordId, p_expected_version: expectedVersion,
      p_status: status, p_received_at: receivedAt as string, p_note: note,
    });
    if (error) return failureFromDatabase(error);
    const saved = toSaveMarks(data);
    return { ok: true, outcome: saved.outcome, student: saved.student };
  } catch {
    return failure("unavailable");
  }
}

const publishInput = z.object({
  academyId: z.uuid(), assignmentId: z.uuid(), key: z.uuid(),
  items: z.array(z.object({ recordId: z.uuid(), expectedVersion: z.number().int().min(1) }).strict()).min(1).max(500)
    .refine((items) => new Set(items.map((item) => item.recordId)).size === items.length),
});

/**
 * Announces the selected students' complete results (all-or-nothing validation). A changed result
 * of an already announced student becomes a correction with a new revision.
 */
export async function publishResults(
  input: { academyId: string; assignmentId: string; key: string; items: { recordId: string; expectedVersion: number }[] }, authority?: Authority | null,
): Promise<PublishResult> {
  const parsed = publishInput.safeParse(input);
  if (!parsed.success) return failure("validation");
  const { academyId, assignmentId, key, items } = parsed.data;
  const caller = await academyMember(academyId, authority);
  if (!caller) return failure("forbidden");
  try {
    const { data, error } = await caller.db.rpc("publish_assignment_results", {
      p_academy_id: academyId, p_assignment_id: assignmentId, p_key: key,
      p_items: items.map((item) => ({ annual_student_record_id: item.recordId, expected_version: item.expectedVersion })),
    });
    if (error) return failureFromDatabase(error);
    const result = toPublish(data);
    return { ok: true, ...result };
  } catch {
    return failure("unavailable");
  }
}

const listInput = z.object({
  academyId: z.uuid(), assignmentId: z.uuid(),
  filter: z.enum(["all", "not_received", "needs_marking", "marked", "unpublished"]),
  limit: z.number().int().min(1).max(1000), offset: z.number().int().min(0),
  search: z.string().trim().max(100).nullable(),
});

/**
 * The assignment's students with work status, marks, totals, and publication state, filtered and paged.
 * `search` matches a name (literal, case-insensitive) or a student-code prefix across the whole cohort.
 */
export async function listMarks(
  input: { academyId: string; assignmentId: string; filter?: MarkFilter; limit?: number; offset?: number; search?: string | null }, authority?: Authority | null,
): Promise<ReadResult<{ total: number; students: StudentWork[] }>> {
  const parsed = listInput.safeParse({ filter: "all", limit: 1000, offset: 0, search: null, ...input });
  if (!parsed.success) return { ok: false, status: 400 };
  const { academyId, assignmentId, filter, limit, offset, search } = parsed.data;
  const caller = await academyMember(academyId, authority);
  if (!caller) return { ok: false, status: 403 };
  try {
    const { data, error } = await caller.db.rpc("list_assignment_marks", {
      p_academy_id: academyId, p_assignment_id: assignmentId, p_filter: filter, p_limit: limit, p_offset: offset,
      ...(search ? { p_search: search } : {}),
    });
    if (error) return { ok: false, status: error.code === "P0001" && error.message === "validation" ? 400 : 500 };
    if (data === null) return { ok: false, status: 404 };
    return { ok: true, data: toStudentList(data) };
  } catch {
    return { ok: false, status: 500 };
  }
}

const resolveInput = z.object({ academyId: z.uuid(), assignmentId: z.uuid(), code: z.string().trim().min(1).max(40) });

/** Looks up the recipient a typed or scanned code identifies, without changing anything. */
export async function resolveStudent(input: { academyId: string; assignmentId: string; code: string }, authority?: Authority | null): Promise<StudentLookup> {
  const parsed = resolveInput.safeParse(input);
  if (!parsed.success) return failure("validation");
  const { academyId, assignmentId, code } = parsed.data;
  const caller = await academyMember(academyId, authority);
  if (!caller) return failure("forbidden");
  try {
    const { data, error } = await caller.db.rpc("resolve_assignment_student", { p_academy_id: academyId, p_assignment_id: assignmentId, p_code: code });
    if (error) return failureFromDatabase(error as DatabaseError);
    return { ok: true, student: toStudentWork(data) };
  } catch {
    return failure("unavailable");
  }
}

// ---------------------------------------------------------------------------------------------
// Reads for the external API.

/** Whether the academy issues student codes (code entry and scanning). False when unknown. */
export async function studentCodesEnabled(academyId: string, authority?: Authority | null): Promise<boolean> {
  const caller = await academyMember(academyId, authority);
  if (!caller) return false;
  const { data } = await caller.db.from("student_code_settings").select("enabled").eq("academy_id", academyId).maybeSingle();
  return data?.enabled ?? false;
}

/** The academy of an assignment the caller can see (RLS), or null for unknown and foreign assignments. */
export async function assignmentAcademy(assignmentId: string, authority?: Authority | null): Promise<string | null> {
  if (!z.uuid().safeParse(assignmentId).success) return null;
  const caller = authority ?? await cookieAuthority();
  if (!caller) return null;
  const { data, error } = await caller.db.from("assignments").select("academy_id").eq("id", assignmentId).maybeSingle();
  if (error) throw error;
  return data?.academy_id ?? null;
}

export type AssignmentSummary = {
  id: string; academicYearId: string; title: string; audience: Assignment["audience"]; levelId: string | null; trackId: string | null;
  dueAt: string | null; state: Assignment["state"]; maxScore: string; partCount: number; recipientCount: number; version: number; updatedAt: string;
};

const listAssignmentsInput = z.object({
  academyId: z.uuid(),
  state: z.enum(ASSIGNMENT_STATES).nullable(),
  limit: z.number().int().min(1).max(100),
  offset: z.number().int().min(0).max(100000),
});

/** One page of the academy's assignments, newest first. Archived ones appear only when asked for. */
export async function listAssignments(
  input: { academyId: string; state?: Assignment["state"] | null; limit?: number; offset?: number }, authority?: Authority | null,
): Promise<ReadResult<{ total: number; assignments: AssignmentSummary[] }>> {
  const parsed = listAssignmentsInput.safeParse({ state: null, limit: 50, offset: 0, ...input });
  if (!parsed.success) return { ok: false, status: 400 };
  const { academyId, state, limit, offset } = parsed.data;
  const caller = await academyMember(academyId, authority);
  if (!caller) return { ok: false, status: 403 };
  try {
    let query = caller.db.from("assignments")
      .select("id,academic_year_id,title,audience,level_id,track_id,due_at,state,max_score,part_count,recipient_count,version,updated_at", { count: "exact" })
      .eq("academy_id", academyId);
    query = state ? query.eq("state", state) : query.neq("state", "archived");
    const { data, error, count } = await query.order("created_at", { ascending: false }).order("id").range(offset, offset + limit - 1);
    if (error) return { ok: false, status: 500 };
    return {
      ok: true,
      data: {
        total: count ?? 0,
        assignments: (data ?? []).map((row) => ({
          id: row.id, academicYearId: row.academic_year_id, title: row.title, audience: row.audience, levelId: row.level_id, trackId: row.track_id,
          dueAt: row.due_at, state: row.state, maxScore: String(row.max_score), partCount: row.part_count, recipientCount: row.recipient_count,
          version: row.version, updatedAt: row.updated_at,
        })),
      },
    };
  } catch {
    return { ok: false, status: 500 };
  }
}
