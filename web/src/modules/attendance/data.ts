import "server-only";

import { z } from "zod";

import type { Authority } from "@/lib/supabase/authority";
import { academyMember } from "@/lib/supabase/membership";
import type { Json } from "@/lib/supabase/database.types";
import { normalizeStudentCode } from "@/modules/students/contract";
import { failure, failureFromDatabase } from "./errors";
import { MAX_SELECTED_CHANGES } from "./limits";
import {
  ATTENDANCE_STATUSES, type AddAttendeeResult, type AttendanceChange, type AttendanceEntry, type AttendanceSheet, type AttendeeSearchResult,
  type ChangeResult, type CheckInResult, type PublishResult, type ReadResult, type UnrecordedAbsenceResult,
} from "./types";

/**
 * Attendance domain operations shared by staff web actions and the external API. Every operation
 * runs as the caller (RLS active) and the database re-checks academy membership, session state,
 * and the academic year inside one transaction. Pass `authority` for token-authenticated requests;
 * it defaults to the request's cookie session.
 */

const statusSchema = z.enum(ATTENDANCE_STATUSES);
const entrySchema = z.object({
  annual_student_record_id: z.string(),
  full_name: z.string(),
  student_code: z.string().nullish(),
  archived: z.boolean(),
  origin: z.enum(["expected", "eligible", "unexpected"]),
  group_name: z.string().nullable(),
  status: statusSchema,
  version: z.number().int().nonnegative(),
  source: z.enum(["manual", "bulk", "check_in"]).nullable(),
  updated_at: z.string().nullable(),
  updated_by: z.string().nullable(),
  updated_by_name: z.string().nullable(),
  checked_in_at: z.string().nullable(),
  published_status: statusSchema.nullable(),
  published_at: z.string().nullable(),
});
const sheetSchema = z.object({
  session: z.object({
    id: z.string(),
    academy_id: z.string(),
    academic_year_id: z.string(),
    schedule_title: z.string(),
    group_name: z.string().nullable(),
    mandatory: z.boolean(),
    location: z.string().nullable(),
    started_at: z.string(),
    auto_end_at: z.string(),
    state: z.enum(["live", "ended"]),
    ended_at: z.string().nullable(),
    year_open: z.boolean(),
    // Optional so a sheet still parses against a database without session archival.
    archived_at: z.string().nullish(),
    metadata_version: z.number().int().optional(),
  }),
  student_codes_enabled: z.boolean().optional(),
  revision: z.number().int().nonnegative(),
  published_revision: z.number().int().nullable(),
  publication_count: z.number().int().nonnegative(),
  last_published_at: z.string().nullable(),
  last_published_by_name: z.string().nullable(),
  entries: z.array(entrySchema),
});
const checkInSchema = z.object({
  outcome: z.enum(["recorded", "already_recorded", "review_required"]),
  entry: entrySchema,
  revision: z.number().int(),
  correction_pending: z.boolean(),
  replayed: z.boolean(),
});
const changeSchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("updated"), changed: z.number().int(), entries: z.array(entrySchema), revision: z.number().int(), replayed: z.boolean() }),
  z.object({ outcome: z.literal("conflict"), conflicts: z.array(entrySchema), revision: z.number().int() }),
]);
const publishSchema = z.object({
  outcome: z.enum(["published", "unchanged", "already_published"]),
  publication_id: z.string().nullable(),
  revision: z.number().int(),
  item_count: z.number().int(),
  replayed: z.boolean(),
});

const toEntry = (row: z.infer<typeof entrySchema>): AttendanceEntry => ({
  annualStudentRecordId: row.annual_student_record_id,
  fullName: row.full_name,
  studentCode: row.student_code ?? null,
  archived: row.archived,
  origin: row.origin,
  groupName: row.group_name,
  status: row.status,
  version: row.version,
  source: row.source,
  updatedAt: row.updated_at,
  updatedBy: row.updated_by,
  updatedByName: row.updated_by_name,
  checkedInAt: row.checked_in_at,
  publishedStatus: row.published_status,
  publishedAt: row.published_at,
});

/** A session's attendance: lifecycle, revision, publication state, counts, and every roster entry. */
export async function getAttendance(academyId: string, sessionId: string, authority?: Authority | null): Promise<ReadResult<AttendanceSheet>> {
  if (!z.uuid().safeParse(sessionId).success) return { ok: false, status: 400 };
  const caller = await academyMember(academyId, authority);
  if (!caller) return { ok: false, status: 403 };
  try {
    const { data, error } = await caller.db.rpc("get_attendance", { p_academy_id: academyId, p_session_id: sessionId });
    if (error) return { ok: false, status: 500 };
    if (data === null) return { ok: false, status: 404 };
    const sheet = sheetSchema.parse(data);
    const published = sheet.publication_count > 0;
    const entries = sheet.entries.map((row) => {
      const entry = toEntry(row);
      return { ...entry, correctionPending: published && entry.status !== (entry.publishedStatus ?? "unknown") };
    });
    const counts = { unknown: 0, present: 0, late: 0, absent: 0, excused: 0, total: entries.length };
    for (const entry of entries) counts[entry.status] += 1;
    const live = sheet.session.state === "live";
    // An archived session is read-only like a closed year.
    const open = sheet.session.year_open && !sheet.session.archived_at;
    return {
      ok: true,
      data: {
        session: {
          id: sheet.session.id,
          academyId: sheet.session.academy_id,
          academicYearId: sheet.session.academic_year_id,
          scheduleTitle: sheet.session.schedule_title,
          groupName: sheet.session.group_name,
          mandatory: sheet.session.mandatory,
          location: sheet.session.location,
          startedAt: sheet.session.started_at,
          autoEndAt: sheet.session.auto_end_at,
          state: sheet.session.state,
          endedAt: sheet.session.ended_at,
          yearOpen: sheet.session.year_open,
          archivedAt: sheet.session.archived_at ?? null,
          metadataVersion: sheet.session.metadata_version ?? 0,
        },
        studentCodesEnabled: sheet.student_codes_enabled ?? false,
        revision: sheet.revision,
        publishedRevision: sheet.published_revision,
        publicationCount: sheet.publication_count,
        lastPublishedAt: sheet.last_published_at,
        lastPublishedByName: sheet.last_published_by_name,
        publication: !published ? "unpublished" : entries.some((entry) => entry.correctionPending) ? "pending_corrections" : "published",
        counts,
        permittedActions: { checkIn: live && open, edit: open, publish: open },
        entries,
      },
    };
  } catch {
    return { ok: false, status: 500 };
  }
}

export const MAX_LATE_AFTER_MINUTES = 1440;
/** Longest raw `student_id`/code text accepted before normalization (outer whitespace is trimmed). */
export const MAX_CODE_INPUT_LENGTH = 64;
const checkInBase = z.object({
  academyId: z.uuid(), sessionId: z.uuid(), idempotencyKey: z.uuid(),
  lateAfterMinutes: z.number().int().min(0).max(MAX_LATE_AFTER_MINUTES).optional(),
});
const checkInInput = z.union([
  checkInBase.extend({ annualStudentRecordId: z.uuid() }).strict(),
  checkInBase.extend({ studentCode: z.string().max(MAX_CODE_INPUT_LENGTH) }).strict(),
]);
export type CheckInInput = z.input<typeof checkInBase> & ({ annualStudentRecordId: string; studentCode?: never } | { studentCode: string; annualStudentRecordId?: never });

/**
 * Positive check-in for a roster student while the session is live, by permanent record UUID or by
 * academy-local student code (resolved by the database in the same transaction; the UUID is never
 * resolved here and sent separately). With `lateAfterMinutes` above 0, a first check-in accepted more
 * than that many minutes after the session started is recorded as Late in the same transaction as the
 * check-in and its receipt; 0 or omitted never marks Late. A replay returns the original acknowledgment.
 */
export async function checkIn(input: CheckInInput, authority?: Authority | null): Promise<CheckInResult> {
  const parsed = checkInInput.safeParse(input);
  if (!parsed.success) return failure("validation");
  const { academyId, sessionId, idempotencyKey, lateAfterMinutes = 0 } = parsed.data;
  const code = "studentCode" in parsed.data ? normalizeStudentCode(parsed.data.studentCode) : undefined;
  if ("studentCode" in parsed.data && code === null) return failure("validation");
  const caller = await academyMember(academyId, authority);
  if (!caller) return failure("forbidden");
  try {
    const { data, error } = code
      ? await caller.db.rpc("check_in_attendance_by_code", {
        p_academy_id: academyId, p_session_id: sessionId, p_code: code, p_key: idempotencyKey, p_late_after_minutes: lateAfterMinutes,
      })
      : await caller.db.rpc("check_in_attendance_with_late", {
        p_academy_id: academyId, p_session_id: sessionId, p_annual_record_id: (parsed.data as { annualStudentRecordId: string }).annualStudentRecordId,
        p_key: idempotencyKey, p_late_after_minutes: lateAfterMinutes,
      });
    if (error) return failureFromDatabase(error);
    const result = checkInSchema.parse(data);
    return {
      ok: true, outcome: result.outcome, entry: toEntry(result.entry), revision: result.revision,
      correctionPending: result.correction_pending, replayed: result.replayed,
    };
  } catch {
    return failure("unavailable");
  }
}

export const MAX_BULK_CHANGES = MAX_SELECTED_CHANGES;
const changeItem = z.object({ annualStudentRecordId: z.uuid(), status: z.enum(ATTENDANCE_STATUSES), expectedVersion: z.number().int().min(0) });
const changesInput = z.object({
  academyId: z.uuid(),
  sessionId: z.uuid(),
  changes: z.array(changeItem).min(1).max(MAX_BULK_CHANGES),
  idempotencyKey: z.uuid(),
});

/**
 * Versioned draft changes, all or nothing. One change is a manual edit; several are a reviewed bulk
 * change. A stale version applies nothing and returns the current entries as conflicts.
 */
export async function changeAttendance(
  input: { academyId: string; sessionId: string; changes: AttendanceChange[]; idempotencyKey: string },
  authority?: Authority | null,
): Promise<ChangeResult> {
  const parsed = changesInput.safeParse(input);
  if (!parsed.success) return failure("validation");
  const { academyId, sessionId, changes, idempotencyKey } = parsed.data;
  if (new Set(changes.map((change) => change.annualStudentRecordId)).size !== changes.length) return failure("validation");
  const caller = await academyMember(academyId, authority);
  if (!caller) return failure("forbidden");
  try {
    const { data, error } = await caller.db.rpc("apply_attendance_changes", {
      p_academy_id: academyId,
      p_session_id: sessionId,
      p_changes: changes.map((change) => ({
        annual_student_record_id: change.annualStudentRecordId, status: change.status, expected_version: change.expectedVersion,
      })) as Json,
      p_operation: changes.length === 1 ? "set" : "bulk",
      p_key: idempotencyKey,
    });
    if (error) return failureFromDatabase(error);
    const result = changeSchema.parse(data);
    return result.outcome === "conflict"
      ? { ok: true, outcome: "conflict", conflicts: result.conflicts.map(toEntry), revision: result.revision }
      : { ok: true, outcome: "updated", changed: result.changed, entries: result.entries.map(toEntry), revision: result.revision, replayed: result.replayed };
  } catch {
    return failure("unavailable");
  }
}

const publishInput = z.object({ academyId: z.uuid(), sessionId: z.uuid(), expectedRevision: z.number().int().min(0), idempotencyKey: z.uuid() });

/** Makes the reviewed revision official. Fails with publication_stale when attendance changed since. */
export async function publishAttendance(input: z.input<typeof publishInput>, authority?: Authority | null): Promise<PublishResult> {
  const parsed = publishInput.safeParse(input);
  if (!parsed.success) return failure("validation");
  const { academyId, sessionId, expectedRevision, idempotencyKey } = parsed.data;
  const caller = await academyMember(academyId, authority);
  if (!caller) return failure("forbidden");
  try {
    const { data, error } = await caller.db.rpc("publish_attendance", {
      p_academy_id: academyId, p_session_id: sessionId, p_expected_revision: expectedRevision, p_key: idempotencyKey,
    });
    if (error) return failureFromDatabase(error);
    const result = publishSchema.parse(data);
    return {
      ok: true, outcome: result.outcome, publicationId: result.publication_id, revision: result.revision,
      itemCount: result.item_count, replayed: result.replayed,
    };
  } catch {
    return failure("unavailable");
  }
}

const reviewedInput = z.object({ academyId: z.uuid(), sessionId: z.uuid(), expectedRevision: z.number().int().min(0), idempotencyKey: z.uuid() });
const unrecordedSchema = z.object({
  outcome: z.enum(["updated", "unchanged", "stale"]),
  changed: z.number().int().nonnegative(),
  revision: z.number().int().nonnegative(),
  replayed: z.boolean(),
});

/**
 * Marks every expected student of a mandatory session who is still Unknown Absent, in one transaction at
 * any roster size (the explicit batch stays capped at 500). Eligible and unexpected students and recorded
 * values are never touched. `stale` means the sheet changed after `expectedRevision` was reviewed; nothing
 * changed and the current revision is returned.
 */
export async function markUnrecordedAbsent(input: z.input<typeof reviewedInput>, authority?: Authority | null): Promise<UnrecordedAbsenceResult> {
  const parsed = reviewedInput.safeParse(input);
  if (!parsed.success) return failure("validation");
  const { academyId, sessionId, expectedRevision, idempotencyKey } = parsed.data;
  const caller = await academyMember(academyId, authority);
  if (!caller) return failure("forbidden");
  try {
    const { data, error } = await caller.db.rpc("mark_unrecorded_absent", {
      p_academy_id: academyId, p_session_id: sessionId, p_expected_revision: expectedRevision, p_key: idempotencyKey,
    });
    if (error) return failureFromDatabase(error);
    const result = unrecordedSchema.parse(data);
    return { ok: true, outcome: result.outcome, changed: result.changed, revision: result.revision, replayed: result.replayed };
  } catch {
    return failure("unavailable");
  }
}

export const MAX_ATTENDEE_PAGE = 50;
export const MAX_ATTENDEE_QUERY_LENGTH = 100;
const searchInput = z.object({
  academyId: z.uuid(), sessionId: z.uuid(), query: z.string().max(MAX_ATTENDEE_QUERY_LENGTH).default(""),
  limit: z.number().int().min(1).max(MAX_ATTENDEE_PAGE).default(20), offset: z.number().int().min(0).max(10_000).default(0),
});
const candidateSchema = z.object({
  items: z.array(z.object({
    annual_student_record_id: z.string(),
    full_name: z.string(),
    level_name: z.string().nullable(),
    group_name: z.string().nullable(),
    participation_type: z.enum(["in_person", "online_only"]),
    student_code: z.string().nullable(),
  })),
  has_more: z.boolean(),
});

/** Active records of the session's academy and year not on its roster, by name or exact current code. Read-only. */
export async function searchAttendees(input: z.input<typeof searchInput>, authority?: Authority | null): Promise<AttendeeSearchResult> {
  const parsed = searchInput.safeParse(input);
  if (!parsed.success) return failure("validation");
  const { academyId, sessionId, query, limit, offset } = parsed.data;
  const caller = await academyMember(academyId, authority);
  if (!caller) return failure("forbidden");
  try {
    const { data, error } = await caller.db.rpc("search_attendee_candidates", {
      p_academy_id: academyId, p_session_id: sessionId, p_query: query, p_limit: limit, p_offset: offset,
    });
    if (error) return failureFromDatabase(error);
    const result = candidateSchema.parse(data);
    return {
      ok: true,
      hasMore: result.has_more,
      items: result.items.map((item) => ({
        annualStudentRecordId: item.annual_student_record_id, fullName: item.full_name, levelName: item.level_name,
        groupName: item.group_name, participationType: item.participation_type, studentCode: item.student_code,
      })),
    };
  } catch {
    return failure("unavailable");
  }
}

const addInput = reviewedInput.extend({ annualStudentRecordId: z.uuid() });
const addSchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.enum(["added", "already_on_roster"]), entry: entrySchema, revision: z.number().int(), replayed: z.boolean() }),
  z.object({ outcome: z.literal("stale"), entry: z.null(), revision: z.number().int(), replayed: z.boolean() }),
]);

/**
 * Explicitly appends an active record of the session's academy and year to its roster as an unexpected
 * attendee (Unknown; the original snapshot and the student's placement never change). Adding does not
 * check the student in. `already_on_roster` returns the existing entry unchanged; `stale` writes nothing.
 */
export async function addAttendee(input: z.input<typeof addInput>, authority?: Authority | null): Promise<AddAttendeeResult> {
  const parsed = addInput.safeParse(input);
  if (!parsed.success) return failure("validation");
  const { academyId, sessionId, annualStudentRecordId, expectedRevision, idempotencyKey } = parsed.data;
  const caller = await academyMember(academyId, authority);
  if (!caller) return failure("forbidden");
  try {
    const { data, error } = await caller.db.rpc("add_session_attendee", {
      p_academy_id: academyId, p_session_id: sessionId, p_record_id: annualStudentRecordId,
      p_expected_revision: expectedRevision, p_key: idempotencyKey,
    });
    if (error) return failureFromDatabase(error);
    const result = addSchema.parse(data);
    return result.outcome === "stale"
      ? { ok: true, outcome: "stale", entry: null, revision: result.revision, replayed: result.replayed }
      : { ok: true, outcome: result.outcome, entry: toEntry(result.entry), revision: result.revision, replayed: result.replayed };
  } catch {
    return failure("unavailable");
  }
}
