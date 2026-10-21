import "server-only";

import { z } from "zod";

import type { StaffApiContext } from "@/lib/api/handler";
import { apiError, apiJson, readJson, snakeKeys, type ApiErrorCode } from "@/lib/api/http";
import { normalizeStudentCode } from "@/modules/students/contract";
import {
  addAttendee, changeAttendance, checkIn, getAttendance, markUnrecordedAbsent, MAX_ATTENDEE_PAGE, MAX_ATTENDEE_QUERY_LENGTH, MAX_BULK_CHANGES,
  MAX_CODE_INPUT_LENGTH, MAX_LATE_AFTER_MINUTES, publishAttendance, searchAttendees,
} from "./data";
import { ATTENDANCE_STATUSES, type AttendanceErrorCode, type AttendanceFailure } from "./types";

/**
 * The attendance part of the external `/api/v1` contract (snake_case JSON). Route handlers resolve
 * the session's academy and call these; documented in docs/api/sessions-attendance.openapi.yaml.
 */

const API_CODES: Record<AttendanceErrorCode, ApiErrorCode> = {
  validation: "INVALID_REQUEST",
  forbidden: "FORBIDDEN",
  not_found: "NOT_FOUND",
  student_not_found: "STUDENT_NOT_FOUND",
  not_on_roster: "NOT_ON_ROSTER",
  student_archived: "STUDENT_ARCHIVED",
  student_codes_disabled: "STUDENT_CODES_DISABLED",
  student_code_retired: "STUDENT_CODE_RETIRED",
  student_code_not_found: "STUDENT_CODE_NOT_FOUND",
  student_code_ambiguous: "STUDENT_CODE_AMBIGUOUS",
  session_ended: "SESSION_ENDED",
  session_archived: "SESSION_ARCHIVED",
  year_unavailable: "YEAR_CLOSED",
  publication_stale: "PUBLICATION_STALE",
  idempotency_conflict: "IDEMPOTENCY_CONFLICT",
  throttled: "THROTTLED",
  unavailable: "INTERNAL",
};

const fail = (context: StaffApiContext, result: AttendanceFailure) =>
  apiError(context, API_CODES[result.code], result.retryAfter ? { retryAfter: result.retryAfter } : undefined);

/** The required `Idempotency-Key` header (a UUID created per action and reused on retry), or null. */
function idempotencyKey(request: Request) {
  const value = request.headers.get("idempotency-key")?.trim() ?? "";
  return z.guid().safeParse(value).success ? value : null;
}

const missingKey = (context: StaffApiContext) =>
  apiError(context, "INVALID_REQUEST", { message: "Send an Idempotency-Key header containing a UUID; reuse it when retrying." });

export async function attendanceResponse(context: StaffApiContext, academyId: string, sessionId: string) {
  const result = await getAttendance(academyId, sessionId, context.authority);
  if (!result.ok) return apiError(context, result.status === 403 ? "FORBIDDEN" : result.status === 404 ? "NOT_FOUND" : result.status === 400 ? "INVALID_REQUEST" : "INTERNAL");
  return apiJson(context, snakeKeys(result.data));
}

/**
 * Exactly one identifier: `student_id` (the academy-local student code, resolved by the database in
 * the same transaction) or `annual_student_record_id` (permanent UUID, independent of codes).
 */
const checkInBody = z.object({
  student_id: z.string().max(MAX_CODE_INPUT_LENGTH).optional(),
  annual_student_record_id: z.guid().optional(),
  late_after_minutes: z.number().int().min(0).max(MAX_LATE_AFTER_MINUTES).optional(),
}).strict().refine((body) => (body.student_id === undefined) !== (body.annual_student_record_id === undefined))
  .refine((body) => body.student_id === undefined || normalizeStudentCode(body.student_id) !== null);

export async function checkInResponse(context: StaffApiContext, request: Request, academyId: string, sessionId: string) {
  const key = idempotencyKey(request);
  if (!key) return missingKey(context);
  const body = checkInBody.safeParse(await readJson(request));
  if (!body.success) {
    return apiError(context, "INVALID_REQUEST", { message: "Send exactly one identifier: student_id (a student code string) or annual_student_record_id (UUID)." });
  }
  const who = body.data.student_id !== undefined
    ? { studentCode: body.data.student_id }
    : { annualStudentRecordId: body.data.annual_student_record_id as string };
  const result = await checkIn({ academyId, sessionId, ...who, idempotencyKey: key, lateAfterMinutes: body.data.late_after_minutes }, context.authority);
  if (!result.ok) return fail(context, result);
  const payload = snakeKeys({ outcome: result.outcome, entry: result.entry, revision: result.revision, correctionPending: result.correctionPending, replayed: result.replayed });
  if (result.outcome === "review_required") return apiError(context, "REVIEW_REQUIRED", { details: payload });
  return apiJson(context, payload);
}

const patchBody = z.object({ status: z.enum(ATTENDANCE_STATUSES), expected_version: z.number().int().min(0) }).strict();

export async function patchResponse(context: StaffApiContext, request: Request, academyId: string, sessionId: string, recordId: string) {
  const key = idempotencyKey(request);
  if (!key) return missingKey(context);
  const body = patchBody.safeParse(await readJson(request));
  if (!body.success || !z.guid().safeParse(recordId).success) return apiError(context, "INVALID_REQUEST");
  const result = await changeAttendance({
    academyId, sessionId, idempotencyKey: key,
    changes: [{ annualStudentRecordId: recordId, status: body.data.status, expectedVersion: body.data.expected_version }],
  }, context.authority);
  if (!result.ok) return fail(context, result);
  if (result.outcome === "conflict") {
    return apiError(context, "ATTENDANCE_CONFLICT", { details: snakeKeys({ current: result.conflicts[0], revision: result.revision }) });
  }
  return apiJson(context, snakeKeys({ outcome: result.outcome, changed: result.changed, entry: result.entries[0], revision: result.revision, replayed: result.replayed }));
}

const bulkBody = z.object({
  changes: z.array(z.object({
    annual_student_record_id: z.guid(), status: z.enum(ATTENDANCE_STATUSES), expected_version: z.number().int().min(0),
  }).strict()).min(1).max(MAX_BULK_CHANGES),
}).strict();

export async function bulkResponse(context: StaffApiContext, request: Request, academyId: string, sessionId: string) {
  const key = idempotencyKey(request);
  if (!key) return missingKey(context);
  const body = bulkBody.safeParse(await readJson(request));
  if (!body.success) return apiError(context, "INVALID_REQUEST");
  const result = await changeAttendance({
    academyId, sessionId, idempotencyKey: key,
    changes: body.data.changes.map((change) => ({
      annualStudentRecordId: change.annual_student_record_id, status: change.status, expectedVersion: change.expected_version,
    })),
  }, context.authority);
  if (!result.ok) return fail(context, result);
  if (result.outcome === "conflict") {
    return apiError(context, "ATTENDANCE_CONFLICT", { details: snakeKeys({ conflicts: result.conflicts, revision: result.revision }) });
  }
  return apiJson(context, snakeKeys({ outcome: result.outcome, changed: result.changed, entries: result.entries, revision: result.revision, replayed: result.replayed }));
}

const publishBody = z.object({ expected_revision: z.number().int().min(0) }).strict();

export async function publishResponse(context: StaffApiContext, request: Request, academyId: string, sessionId: string) {
  const key = idempotencyKey(request);
  if (!key) return missingKey(context);
  const body = publishBody.safeParse(await readJson(request));
  if (!body.success) return apiError(context, "INVALID_REQUEST");
  const result = await publishAttendance({ academyId, sessionId, expectedRevision: body.data.expected_revision, idempotencyKey: key }, context.authority);
  if (!result.ok) return fail(context, result);
  return apiJson(context, snakeKeys({
    outcome: result.outcome, publicationId: result.publicationId, revision: result.revision, itemCount: result.itemCount, replayed: result.replayed,
  }));
}

const reviewedBody = z.object({ expected_revision: z.number().int().min(0) }).strict();

const staleReview = (context: StaffApiContext, revision: number) =>
  apiError(context, "ATTENDANCE_REVIEW_STALE", { details: { revision } });

/** All remaining expected Unknown students of a mandatory session → Absent, against the reviewed revision. */
export async function unrecordedAbsenceResponse(context: StaffApiContext, request: Request, academyId: string, sessionId: string) {
  const key = idempotencyKey(request);
  if (!key) return missingKey(context);
  const body = reviewedBody.safeParse(await readJson(request));
  if (!body.success) return apiError(context, "INVALID_REQUEST");
  const result = await markUnrecordedAbsent({ academyId, sessionId, expectedRevision: body.data.expected_revision, idempotencyKey: key }, context.authority);
  if (!result.ok) return fail(context, result);
  if (result.outcome === "stale") return staleReview(context, result.revision);
  return apiJson(context, { outcome: result.outcome, changed: result.changed, revision: result.revision, replayed: result.replayed });
}

const searchParams = z.object({
  q: z.string().max(MAX_ATTENDEE_QUERY_LENGTH).default(""),
  limit: z.coerce.number().int().min(1).max(MAX_ATTENDEE_PAGE).default(20),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

/** Candidates for an unexpected attendee: active same-academy, same-year records not on the roster. */
export async function attendeeSearchResponse(context: StaffApiContext, request: Request, academyId: string, sessionId: string) {
  const url = new URL(request.url);
  const params = searchParams.safeParse({
    q: url.searchParams.get("q") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });
  if (!params.success) return apiError(context, "INVALID_REQUEST");
  const result = await searchAttendees({ academyId, sessionId, query: params.data.q, limit: params.data.limit, offset: params.data.offset }, context.authority);
  if (!result.ok) return fail(context, result);
  return apiJson(context, snakeKeys({ items: result.items, hasMore: result.hasMore }));
}

const addBody = z.object({ annual_student_record_id: z.guid(), expected_revision: z.number().int().min(0) }).strict();

/** Explicitly appends an unexpected attendee (Unknown) to the roster; adding never checks the student in. */
export async function addAttendeeResponse(context: StaffApiContext, request: Request, academyId: string, sessionId: string) {
  const key = idempotencyKey(request);
  if (!key) return missingKey(context);
  const body = addBody.safeParse(await readJson(request));
  if (!body.success) return apiError(context, "INVALID_REQUEST");
  const result = await addAttendee({
    academyId, sessionId, annualStudentRecordId: body.data.annual_student_record_id, expectedRevision: body.data.expected_revision, idempotencyKey: key,
  }, context.authority);
  if (!result.ok) return fail(context, result);
  if (result.outcome === "stale") return staleReview(context, result.revision);
  return apiJson(context, snakeKeys({ outcome: result.outcome, entry: result.entry, revision: result.revision, replayed: result.replayed }));
}
