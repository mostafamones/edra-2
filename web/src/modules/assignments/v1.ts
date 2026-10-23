import "server-only";

import { z } from "zod";

import type { StaffApiContext } from "@/lib/api/handler";
import { apiError, apiJson, readJson, snakeKeys, type ApiErrorCode } from "@/lib/api/http";
import { normalizeStudentCode } from "@/modules/students/contract";
import { assignmentAcademy, getAssignment, listAssignments, listMarks, publishResults, resolveStudent, saveMarks, studentCodesEnabled } from "./data";
import { ASSIGNMENT_STATES, type AssignmentErrorCode, type AssignmentFailure, type StudentWork } from "./types";

/**
 * The assignments part of the external `/api/v1` contract (snake_case JSON), staff only. Student
 * submission endpoints are not part of it yet. Documented in docs/api/assignments.openapi.yaml.
 */

const API_CODES: Record<AssignmentErrorCode, ApiErrorCode> = {
  stale_basis: "ASSIGNMENT_CONFLICT",
  online_draft: "ASSIGNMENT_CONFLICT",
  not_qualified: "ASSIGNMENT_CONFLICT",
  source_locked: "ASSIGNMENT_CONFLICT",
  question_excluded: "INVALID_REQUEST",
  validation: "INVALID_REQUEST",
  forbidden: "FORBIDDEN",
  not_found: "NOT_FOUND",
  year_unavailable: "YEAR_CLOSED",
  assignment_conflict: "ASSIGNMENT_CONFLICT",
  invalid_audience: "INVALID_REQUEST",
  invalid_state: "ASSIGNMENT_NOT_OPEN",
  structure_locked: "INVALID_REQUEST",
  incomplete: "INVALID_REQUEST",
  has_activity: "INVALID_REQUEST",
  not_recipient: "NOT_A_RECIPIENT",
  invalid_score: "INVALID_SCORE",
  unknown_part: "UNKNOWN_PART",
  assignment_closed: "ASSIGNMENT_CLOSED",
  has_marks: "HAS_MARKS",
  student_codes_disabled: "STUDENT_CODES_DISABLED",
  student_code_not_found: "STUDENT_CODE_NOT_FOUND",
  student_code_retired: "STUDENT_CODE_RETIRED",
  student_code_ambiguous: "STUDENT_CODE_AMBIGUOUS",
  student_changed: "STUDENT_CHANGED",
  idempotency_conflict: "IDEMPOTENCY_CONFLICT",
  throttled: "THROTTLED",
  unavailable: "INTERNAL",
};

const fail = (context: StaffApiContext, result: AssignmentFailure) =>
  apiError(context, API_CODES[result.code], result.retryAfter ? { retryAfter: result.retryAfter } : undefined);

const readFail = (context: StaffApiContext, status: 400 | 403 | 404 | 500) =>
  apiError(context, status === 400 ? "INVALID_REQUEST" : status === 403 ? "FORBIDDEN" : status === 404 ? "NOT_FOUND" : "INTERNAL");

/** The student row as the API shows it (staff only, including saved per-question answers), snake_case. */
const studentJson = ({ recordId, ...student }: StudentWork) => snakeKeys({ annualStudentRecordId: recordId, ...student });

function intParam(value: string | null, fallback: number, min: number, max: number): number | null {
  if (value === null) return fallback;
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
}

/** GET /api/v1/academies/{academyId}/assignments?state=&limit=&offset= */
export async function assignmentsResponse(context: StaffApiContext, academyId: string, params: URLSearchParams) {
  const state = params.get("state");
  const limit = intParam(params.get("limit"), 50, 1, 100);
  const offset = intParam(params.get("offset"), 0, 0, 100000);
  if (!z.guid().safeParse(academyId).success || limit === null || offset === null
    || (state !== null && !(ASSIGNMENT_STATES as readonly string[]).includes(state))) {
    return apiError(context, "INVALID_REQUEST");
  }
  const result = await listAssignments({ academyId, state: state as (typeof ASSIGNMENT_STATES)[number] | null, limit, offset }, context.authority);
  if (!result.ok) return readFail(context, result.status);
  return apiJson(context, snakeKeys(result.data));
}

/** Resolves an assignment's academy for token clients. Unknown and foreign assignments are both 404. */
export async function withAssignmentAcademy(context: StaffApiContext, assignmentId: string, handler: (academyId: string) => Promise<Response>) {
  const academyId = await assignmentAcademy(assignmentId, context.authority);
  return academyId ? handler(academyId) : apiError(context, "NOT_FOUND");
}

/** GET /api/v1/assignments/{assignmentId} — the staff document plus what the caller may do with it now. */
export async function assignmentResponse(context: StaffApiContext, academyId: string, assignmentId: string) {
  const result = await getAssignment(academyId, assignmentId, context.authority);
  if (!result.ok) return readFail(context, result.status);
  const assignment = result.data;
  // Mirrors the database's marking checks so clients never derive permission themselves.
  const markable = assignment.ready && assignment.yearOpen && assignment.state !== "archived";
  return apiJson(context, snakeKeys({
    ...assignment,
    studentCodesEnabled: await studentCodesEnabled(academyId, context.authority),
    actions: { mark: markable, recordWork: markable && assignment.state === "active", announce: markable },
  }));
}

const FILTERS = ["all", "not_received", "needs_marking", "marked", "unpublished"] as const;

/** GET /api/v1/assignments/{assignmentId}/marks?filter=&search=&limit=&offset= */
export async function marksResponse(context: StaffApiContext, academyId: string, assignmentId: string, params: URLSearchParams) {
  const filter = params.get("filter") ?? "all";
  const search = params.get("search");
  const limit = intParam(params.get("limit"), 200, 1, 1000);
  const offset = intParam(params.get("offset"), 0, 0, 100000);
  if (limit === null || offset === null || !(FILTERS as readonly string[]).includes(filter) || (search?.length ?? 0) > 100) {
    return apiError(context, "INVALID_REQUEST");
  }
  const result = await listMarks({ academyId, assignmentId, filter: filter as (typeof FILTERS)[number], limit, offset, search }, context.authority);
  if (!result.ok) return readFail(context, result.status);
  return apiJson(context, { total: result.data.total, students: result.data.students.map(studentJson) });
}

/** The required `Idempotency-Key` header (a UUID created per action and reused on retry), or null. */
function idempotencyKey(request: Request) {
  const value = request.headers.get("idempotency-key")?.trim() ?? "";
  return z.guid().safeParse(value).success ? value : null;
}

/**
 * Exactly one identifier: `student_id` (the academy-local student code, resolved by the database in
 * the same transaction) or `annual_student_record_id` (permanent UUID, independent of codes).
 */
const patchBody = z.object({
  student_id: z.string().max(40).optional(),
  annual_student_record_id: z.guid().optional(),
  /** With student_id: the student the code was resolved to; the save fails if the code now names someone else. */
  expected_annual_student_record_id: z.guid().optional(),
  expected_version: z.number().int().min(1),
  marks: z.array(z.object({
    part_id: z.guid(), score: z.string().max(10).nullable(), excused_reason: z.string().trim().min(1).max(500).optional(),
  }).strict()).max(50).default([]),
  /** Per-question entry: a choice (null = explicitly unanswered), a decimal mark, or clear (not entered). */
  answers: z.array(z.union([
    z.object({ question_id: z.guid(), choice_id: z.guid().nullable() }).strict(),
    z.object({ question_id: z.guid(), score: z.string().max(10) }).strict(),
    z.object({ question_id: z.guid(), clear: z.literal(true) }).strict(),
  ])).max(1000).default([]),
  feedback: z.string().max(5000).optional(),
}).strict()
  .refine((body) => (body.student_id === undefined) !== (body.annual_student_record_id === undefined))
  .refine((body) => body.expected_annual_student_record_id === undefined || body.student_id !== undefined)
  .refine((body) => body.student_id === undefined || normalizeStudentCode(body.student_id) !== null)
  .refine((body) => body.marks.length > 0 || body.answers.length > 0 || body.feedback !== undefined);

/** PATCH /api/v1/assignments/{assignmentId}/marks — save one student's answers, part marks and/or feedback. */
export async function patchMarksResponse(context: StaffApiContext, request: Request, academyId: string, assignmentId: string) {
  const key = idempotencyKey(request);
  if (!key) return apiError(context, "INVALID_REQUEST", { message: "Send an Idempotency-Key header containing a UUID; reuse it when retrying." });
  const body = patchBody.safeParse(await readJson(request));
  if (!body.success) {
    return apiError(context, "INVALID_REQUEST", { message: "Send exactly one of student_id (a student code) or annual_student_record_id, an expected_version, and answers, marks or feedback." });
  }
  const { student_id: code, annual_student_record_id: recordId, expected_annual_student_record_id: expectedRecordId, expected_version: expectedVersion, marks, answers, feedback } = body.data;
  const result = await saveMarks({
    academyId, assignmentId, recordId: recordId ?? null, code: code ?? null, expectedRecordId: expectedRecordId ?? null, expectedVersion, key, feedback,
    marks: marks.map((mark) => ({ partId: mark.part_id, score: mark.score, ...(mark.excused_reason ? { excusedReason: mark.excused_reason } : {}) })),
    answers: answers.map((answer) => "clear" in answer ? { questionId: answer.question_id, clear: true as const }
      : "score" in answer ? { questionId: answer.question_id, score: answer.score } : { questionId: answer.question_id, choiceId: answer.choice_id }),
  }, context.authority);
  if (!result.ok) return fail(context, result);
  if (result.outcome === "conflict") return apiError(context, "MARKS_CONFLICT", { details: { current: studentJson(result.student) } });
  return apiJson(context, { outcome: result.outcome, student: studentJson(result.student), work_recorded: result.workRecorded, replayed: result.replayed });
}

const resolutionBody = z.object({ student_id: z.string().max(40) }).strict().refine((body) => normalizeStudentCode(body.student_id) !== null);

/** POST /api/v1/assignments/{assignmentId}/student-resolution — identify a recipient from a typed or scanned code. */
export async function resolutionResponse(context: StaffApiContext, request: Request, academyId: string, assignmentId: string) {
  const body = resolutionBody.safeParse(await readJson(request));
  if (!body.success) return apiError(context, "INVALID_REQUEST", { message: "Send student_id: a student code string." });
  const result = await resolveStudent({ academyId, assignmentId, code: body.data.student_id }, context.authority);
  if (!result.ok) return fail(context, result);
  return apiJson(context, { student: studentJson(result.student) });
}

const publicationBody = z.object({
  items: z.array(z.object({ annual_student_record_id: z.guid(), expected_version: z.number().int().min(1) }).strict()).min(1).max(500)
    .refine((items) => new Set(items.map((item) => item.annual_student_record_id)).size === items.length),
}).strict();

/**
 * POST /api/v1/assignments/{assignmentId}/results/publications — announce the selected students' complete
 * results, all or nothing. A rejected selection announces nobody and lists each failing student.
 */
export async function publicationResponse(context: StaffApiContext, request: Request, academyId: string, assignmentId: string) {
  const key = idempotencyKey(request);
  if (!key) return apiError(context, "INVALID_REQUEST", { message: "Send an Idempotency-Key header containing a UUID; reuse it when retrying." });
  const body = publicationBody.safeParse(await readJson(request));
  if (!body.success) return apiError(context, "INVALID_REQUEST", { message: "Send items: 1–500 unique {annual_student_record_id, expected_version}." });
  const result = await publishResults({
    academyId, assignmentId, key, items: body.data.items.map((item) => ({ recordId: item.annual_student_record_id, expectedVersion: item.expected_version })),
  }, context.authority);
  if (!result.ok) return fail(context, result);
  if (result.outcome === "rejected") {
    return apiError(context, "PUBLICATION_REJECTED", {
      details: { failures: result.failures.map((failure) => ({ annual_student_record_id: failure.recordId, reason: failure.reason })) },
    });
  }
  return apiJson(context, {
    outcome: result.outcome, replayed: result.replayed,
    results: result.results.map((item) => ({ annual_student_record_id: item.recordId, outcome: item.outcome, revision: item.revision })),
  });
}
