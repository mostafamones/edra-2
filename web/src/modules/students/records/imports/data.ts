import { z } from "zod";

import { staffContext, type ReadResult, type StaffContext } from "../data";
import { canImportStudents } from "../permissions";
import { PARTICIPATION_TYPES } from "../validation";
import type { ImportRowParams } from "./params";
import {
  CELL_PROBLEMS, IMPORT_FIELDS, IMPORT_FORMATS, IMPORT_OUTCOMES, IMPORT_STATUSES, type ImportRow, type ImportRowsPage,
  type ImportSession, type ImportSummary, type ImportLog,
} from "./types";

/**
 * Server-only reads for student imports. Every read checks that the caller is an owner, head admin or admin
 * of the academy and runs through the caller's session, so RLS applies as well.
 */

async function managerContext(academyId: string): Promise<StaffContext | null> {
  const actor = await staffContext(academyId);
  return actor && canImportStudents(actor.role) ? actor : null;
}

const STATES = ["staging", "reviewing", "importing", "completed", "cancelled", "blocked"] as const;
const SESSION_COLUMNS = "id,import_number,created_by,imported_by_name,academy_id,academic_year_id,file_name,format,worksheet,expected_rows,staged_rows,defaults,state,revision,batch_count,blocked_reason,created_at,confirmed_at,completed_at";

const sessionSchema = z.object({
  id: z.string(),
  import_number: z.number().int().positive(),
  created_by: z.string(),
  imported_by_name: z.string(),
  academy_id: z.string(),
  academic_year_id: z.string(),
  file_name: z.string(),
  format: z.enum(IMPORT_FORMATS),
  worksheet: z.string().nullable(),
  expected_rows: z.number().int(),
  staged_rows: z.number().int(),
  defaults: z.record(z.string(), z.unknown()).transform((value) =>
    Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item === "string")) as ImportSession["defaults"]),
  state: z.enum(STATES),
  revision: z.number().int(),
  batch_count: z.number().int().nullable(),
  blocked_reason: z.string().nullable(),
  created_at: z.string(),
  confirmed_at: z.string().nullable(),
  completed_at: z.string().nullable(),
});

const toSession = (row: z.infer<typeof sessionSchema>): ImportSession => ({
  id: row.id,
  importNumber: row.import_number,
  createdBy: row.created_by,
  importedByName: row.imported_by_name,
  academyId: row.academy_id,
  academicYearId: row.academic_year_id,
  fileName: row.file_name,
  format: row.format,
  worksheet: row.worksheet,
  expectedRows: row.expected_rows,
  stagedRows: row.staged_rows,
  defaults: row.defaults,
  state: row.state,
  revision: row.revision,
  batchCount: row.batch_count,
  blockedReason: row.blocked_reason,
  createdAt: row.created_at,
  confirmedAt: row.confirmed_at,
  completedAt: row.completed_at,
});

/** Completed imports for managers of this academy, including the original importing staff member. */
export async function listImportLogs(academyId: string, pageIndex: number): Promise<ReadResult<{ logs: ImportLog[]; total: number }>> {
  const actor = await managerContext(academyId);
  if (!actor) return { ok: false, status: 403 };
  if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex > 99999) return { ok: false, status: 400 };
  const { data, error, count } = await actor.db.from("student_import_sessions")
    .select(`${SESSION_COLUMNS},created_count,skipped_count,failed_count`, { count: "exact" })
    .eq("academy_id", academyId).eq("state", "completed")
    .order("import_number", { ascending: false }).range(pageIndex * 20, pageIndex * 20 + 19);
  if (error) return { ok: false, status: 500 };
  const schema = sessionSchema.extend({ created_count: z.number().int(), skipped_count: z.number().int(), failed_count: z.number().int() });
  const parsed = z.array(schema).safeParse(data);
  if (!parsed.success) return { ok: false, status: 500 };
  return { ok: true, data: { total: count ?? 0, logs: parsed.data.map((row) => ({ ...toSession(row), createdCount: row.created_count, skippedCount: row.skipped_count, failedCount: row.failed_count })) } };
}

const count = z.number().int().nonnegative();
const summarySchema = sessionSchema.extend({
  counts: z.object({
    ready: count, invalid: count, duplicate_existing: count, duplicate_file: count, excluded: count,
    pending: count, created: count, skipped: count, failed: count,
    skipped_by_code: z.record(z.string(), count),
    batched: count,
    next_batch: z.number().int().nullable(),
  }),
});

/** A session and its review/execution counts. */
export async function getImportSummary(academyId: string, sessionId: string): Promise<ReadResult<ImportSummary>> {
  if (!z.uuid().safeParse(sessionId).success) return { ok: false, status: 404 };
  const actor = await managerContext(academyId);
  if (!actor) return { ok: false, status: 403 };
  try {
    const { data, error } = await actor.db.rpc("student_import_summary", { p_session_id: sessionId });
    if (error) return { ok: false, status: 500 };
    if (!data) return { ok: false, status: 404 };
    const parsed = summarySchema.parse(data);
    if (parsed.academy_id !== academyId) return { ok: false, status: 404 };
    const { counts } = parsed;
    return {
      ok: true,
      data: {
        ...toSession(parsed),
        counts: {
          ready: counts.ready, invalid: counts.invalid, duplicate_existing: counts.duplicate_existing,
          duplicate_file: counts.duplicate_file, excluded: counts.excluded, pending: counts.pending,
          created: counts.created, skipped: counts.skipped, failed: counts.failed,
          skippedByCode: counts.skipped_by_code, batched: counts.batched, nextBatch: counts.next_batch,
        },
      },
    };
  } catch {
    return { ok: false, status: 500 };
  }
}

/** The caller's most recent import in this academy that is still staging, in review, or importing. */
export async function findUnfinishedImport(academyId: string): Promise<ReadResult<ImportSession | null>> {
  const actor = await managerContext(academyId);
  if (!actor) return { ok: false, status: 403 };
  const { data, error } = await actor.db.from("student_import_sessions").select(SESSION_COLUMNS)
    .eq("academy_id", academyId).eq("created_by", actor.userId).in("state", ["staging", "reviewing", "importing"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) return { ok: false, status: 500 };
  const parsed = data ? sessionSchema.safeParse(data) : null;
  if (parsed && !parsed.success) return { ok: false, status: 500 };
  return { ok: true, data: parsed ? toSession(parsed.data) : null };
}

async function sessionInAcademy(actor: StaffContext, academyId: string, sessionId: string) {
  const { data, error } = await actor.db.from("student_import_sessions").select("id,format")
    .eq("academy_id", academyId).eq("id", sessionId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

const cellSchema = z.union([z.string(), z.null(), z.object({ problem: z.enum(CELL_PROBLEMS) })]);
const sourceSchema = z.record(z.string(), cellSchema).transform((value) =>
  Object.fromEntries(Object.entries(value).filter(([key]) => (IMPORT_FIELDS as readonly string[]).includes(key))) as ImportRow["source"]);
const inputSchema = z.object({
  full_name: z.string().nullable(),
  student_phone: z.string().nullable(),
  parent_phone: z.string().nullable(),
  level_id: z.string().nullable(),
  track_id: z.string().nullable(),
  primary_group_id: z.string().nullable(),
  participation_type: z.enum(PARTICIPATION_TYPES).nullable(),
});
const issueSchema = z.object({ field: z.enum(IMPORT_FIELDS), code: z.string(), detail: z.string().optional() });

const rowSchema = z.object({
  ordinal: z.number().int(),
  source_row: z.number().int(),
  source: sourceSchema,
  corrected: z.boolean(),
  input: inputSchema.nullable(),
  issues: z.array(issueSchema),
  excluded: z.boolean(),
  status: z.enum(IMPORT_STATUSES),
  existing_archived: z.boolean().nullable(),
  duplicate_rows: z.array(z.number().int()).nullable(),
  batch_index: z.number().int().nullable(),
  outcome: z.enum(IMPORT_OUTCOMES).nullable(),
  outcome_code: z.string().nullable(),
  record_id: z.string().nullable(),
  level_name: z.string().nullable(),
  track_name: z.string().nullable(),
  group_name: z.string().nullable(),
});

const toRow = (row: z.infer<typeof rowSchema>): ImportRow => ({
  ordinal: row.ordinal,
  sourceRow: row.source_row,
  source: row.source,
  corrected: row.corrected,
  input: row.input,
  issues: row.issues,
  excluded: row.excluded,
  status: row.status,
  existingArchived: row.existing_archived,
  duplicateRows: row.duplicate_rows,
  batchIndex: row.batch_index,
  outcome: row.outcome,
  outcomeCode: row.outcome_code,
  recordId: row.record_id,
  levelName: row.level_name,
  trackName: row.track_name,
  groupName: row.group_name,
});

/** One page of a session's rows, filtered by status or outcome and searched by name, phone, or row. */
export async function listImportRows(academyId: string, sessionId: string, params: ImportRowParams): Promise<ReadResult<ImportRowsPage>> {
  if (!z.uuid().safeParse(sessionId).success) return { ok: false, status: 404 };
  const actor = await managerContext(academyId);
  if (!actor) return { ok: false, status: 403 };
  try {
    if (!(await sessionInAcademy(actor, academyId, sessionId))) return { ok: false, status: 404 };
    const args = {
      p_session_id: sessionId,
      p_status: params.status,
      p_search: params.search.trim() || null,
      p_page_index: params.pageIndex,
      p_page_size: params.pageSize,
    };
    // The generator types RPC arguments as non-null; the function treats NULL filters as "any".
    const { data, error } = await actor.db.rpc("list_student_import_rows", args as { [K in keyof typeof args]: NonNullable<(typeof args)[K]> });
    if (error) return { ok: false, status: error.code === "P0001" && error.message === "validation" ? 400 : 500 };
    const parsed = z.object({ rows: z.array(rowSchema), total: count }).parse(data);
    return { ok: true, data: { rows: parsed.rows.map(toRow), total: parsed.total } };
  } catch {
    return { ok: false, status: 500 };
  }
}
