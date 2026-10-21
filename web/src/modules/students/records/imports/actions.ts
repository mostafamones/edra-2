"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { failure, failureFromDatabase } from "../errors";
import type { StudentRecordResult } from "../types";
import { PARTICIPATION_TYPES, studentRecordInputSchema } from "../validation";
import { IMPORT_LIMITS } from "./limits";
import { CELL_PROBLEMS, IMPORT_FIELDS, IMPORT_FORMATS, type ImportBatchResult, type ImportDefaults, type ImportFormat, type StagedRow } from "./types";

/**
 * Import mutations. Each one calls a database RPC that re-checks the caller's role, the session's
 * owner and state, and the open academic year; nothing here trusts client-supplied statuses or counts.
 */

const sessionId = z.guid();
const revision = z.number().int().positive();
const ordinal = z.number().int().min(1).max(IMPORT_LIMITS.rows);

async function client() {
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  return data?.claims ? db : null;
}

const idOrEmpty = z.union([z.guid(), z.literal("")]);
const startSchema = z.object({
  scope: z.object({ academyId: z.guid(), academicYearId: z.guid() }),
  source: z.object({
    fileName: z.string().trim().min(1).max(255),
    format: z.enum(IMPORT_FORMATS),
    worksheet: z.string().min(1).max(255).nullable(),
    defaults: z.object({
      levelId: z.string().max(40),
      trackId: idOrEmpty,
      primaryGroupId: idOrEmpty,
      participationType: z.union([z.enum(PARTICIPATION_TYPES), z.literal("")]),
    }),
    /** The caller's unconfirmed session this one replaces, which is cancelled. */
    replaces: z.guid().nullable(),
  }),
  expectedRows: z.number().int().min(1).max(IMPORT_LIMITS.rows),
});

export type ImportSourceMetadata = {
  fileName: string;
  format: ImportFormat;
  worksheet: string | null;
  defaults: ImportDefaults;
  replaces: string | null;
};

/** Opens a staging session for one parsed file and its mapping defaults. */
export async function startStudentImport(
  scope: { academyId: string; academicYearId: string }, source: ImportSourceMetadata, expectedRows: number,
): Promise<StudentRecordResult<{ sessionId: string }>> {
  const parsed = startSchema.safeParse({ scope, source, expectedRows });
  if (!parsed.success) return failure("validation");
  const db = await client();
  if (!db) return failure("forbidden");
  const { defaults } = parsed.data.source;
  try {
    const { data, error } = await db.rpc("start_student_import", {
      p_academy_id: parsed.data.scope.academyId,
      p_academic_year_id: parsed.data.scope.academicYearId,
      p_file_name: parsed.data.source.fileName,
      p_format: parsed.data.source.format,
      p_worksheet: parsed.data.source.worksheet as string,
      p_expected_rows: parsed.data.expectedRows,
      p_defaults: {
        level_id: defaults.levelId || null,
        track_id: defaults.trackId || null,
        primary_group_id: defaults.primaryGroupId || null,
        participation_type: defaults.participationType || null,
      },
      p_replaces: parsed.data.source.replaces as string,
    });
    if (error) return failureFromDatabase(error);
    return { ok: true, data: { sessionId: data } };
  } catch {
    return failure("unavailable");
  }
}

const cellSchema = z.union([
  z.string().max(IMPORT_LIMITS.cellLength),
  z.null(),
  z.object({ problem: z.enum(CELL_PROBLEMS) }).strict(),
]);
const stagedRowSchema = z.object({
  ordinal,
  sourceRow: z.number().int().min(0),
  values: z.partialRecord(z.enum(IMPORT_FIELDS), cellSchema),
}).strict();
const stageSchema = z.array(stagedRowSchema).min(1).max(IMPORT_LIMITS.stageRows);

/** Stages one request of mapped rows (at most 100 rows and 256 KiB). Safe to retry. */
export async function stageStudentImportRows(id: string, rows: StagedRow[]): Promise<StudentRecordResult<{ staged: number }>> {
  const parsed = stageSchema.safeParse(rows);
  if (!sessionId.safeParse(id).success || !parsed.success) return failure("validation");
  if (new TextEncoder().encode(JSON.stringify(rows)).length > IMPORT_LIMITS.stageBytes) return failure("validation");
  const db = await client();
  if (!db) return failure("forbidden");
  try {
    const { data, error } = await db.rpc("stage_student_import_rows", {
      p_session_id: id,
      p_rows: parsed.data.map((row) => ({ ordinal: row.ordinal, source_row: row.sourceRow, values: row.values })),
    });
    if (error) return failureFromDatabase(error);
    return { ok: true, data: { staged: data } };
  } catch {
    return failure("unavailable");
  }
}

/** Validates every staged row and opens the review once the whole file has been staged. */
export async function finalizeStudentImportPreview(id: string): Promise<StudentRecordResult<{ revision: number }>> {
  if (!sessionId.safeParse(id).success) return failure("not_found");
  const db = await client();
  if (!db) return failure("forbidden");
  try {
    const { data, error } = await db.rpc("finalize_student_import", { p_session_id: id });
    if (error) return failureFromDatabase(error);
    return { ok: true, data: { revision: data } };
  } catch {
    return failure("unavailable");
  }
}

/**
 * Replaces a staged row's values with a correction. The input has the ordinary record shape and is
 * validated the same way, but it only changes the staged row: no student record is written.
 */
export async function correctStudentImportRow(
  id: string, expectedRevision: number, rowOrdinal: number, input: unknown,
): Promise<StudentRecordResult<{ revision: number }>> {
  if (!sessionId.safeParse(id).success || !revision.safeParse(expectedRevision).success || !ordinal.safeParse(rowOrdinal).success) {
    return failure("validation");
  }
  const parsed = studentRecordInputSchema.safeParse(input);
  if (!parsed.success) return failure("validation");
  const value = parsed.data;
  const db = await client();
  if (!db) return failure("forbidden");
  try {
    const { data, error } = await db.rpc("correct_student_import_row", {
      p_session_id: id,
      p_expected_revision: expectedRevision,
      p_ordinal: rowOrdinal,
      p_input: {
        full_name: value.fullName,
        student_phone: value.studentPhone,
        parent_phone: value.parentPhone,
        level_id: value.levelId,
        track_id: value.trackId,
        primary_group_id: value.primaryGroupId,
        participation_type: value.participationType,
      },
    });
    if (error) return failureFromDatabase(error);
    return { ok: true, data: { revision: data } };
  } catch {
    return failure("unavailable");
  }
}

/** Excludes a staged row from the import, or includes it again. */
export async function setStudentImportRowExcluded(
  id: string, expectedRevision: number, rowOrdinal: number, excluded: boolean,
): Promise<StudentRecordResult<{ revision: number }>> {
  if (!sessionId.safeParse(id).success || !revision.safeParse(expectedRevision).success
    || !ordinal.safeParse(rowOrdinal).success || typeof excluded !== "boolean") return failure("validation");
  const db = await client();
  if (!db) return failure("forbidden");
  try {
    const { data, error } = await db.rpc("set_student_import_row_excluded", {
      p_session_id: id, p_expected_revision: expectedRevision, p_ordinal: rowOrdinal, p_excluded: excluded,
    });
    if (error) return failureFromDatabase(error);
    return { ok: true, data: { revision: data } };
  } catch {
    return failure("unavailable");
  }
}

/** Removes draft entries as one revision-checked transaction; preserves them in the import log. */
export async function removeStudentImportEntries(id: string, expectedRevision: number, ordinals: number[]): Promise<StudentRecordResult<{ revision: number }>> {
  if (!sessionId.safeParse(id).success || !revision.safeParse(expectedRevision).success
    || !z.array(ordinal).min(1).max(IMPORT_LIMITS.rows).safeParse(ordinals).success
    || new Set(ordinals).size !== ordinals.length) return failure("validation");
  const db = await client();
  if (!db) return failure("forbidden");
  try {
    const { data, error } = await db.rpc("remove_student_import_entries", { p_session_id: id, p_expected_revision: expectedRevision, p_ordinals: ordinals });
    return error ? failureFromDatabase(error) : { ok: true, data: { revision: data } };
  } catch { return failure("unavailable"); }
}

/**
 * Revalidates and confirms the reviewed import. If current records or the academy structure changed
 * the outcome, the refreshed preview is saved and `outcome_changed` asks staff to review again.
 */
export async function confirmStudentImport(id: string, expectedRevision: number): Promise<StudentRecordResult<{ batchCount: number }>> {
  if (!sessionId.safeParse(id).success || !revision.safeParse(expectedRevision).success) return failure("validation");
  const db = await client();
  if (!db) return failure("forbidden");
  try {
    const { data, error } = await db.rpc("confirm_student_import", { p_session_id: id, p_expected_revision: expectedRevision });
    if (error) return failureFromDatabase(error);
    const result = z.object({ confirmed: z.boolean(), batch_count: z.number().int().optional() }).parse(data);
    if (!result.confirmed) return failure("outcome_changed");
    return { ok: true, data: { batchCount: result.batch_count ?? 0 } };
  } catch {
    return failure("unavailable");
  }
}

const batchSchema = z.object({
  state: z.enum(["staging", "reviewing", "importing", "completed", "cancelled", "blocked"]),
  blocked_reason: z.string().nullable(),
  created: z.number().int(),
  skipped: z.number().int(),
  failed: z.number().int(),
  pending: z.number().int(),
  next_batch: z.number().int().nullable(),
});

/** Creates one confirmed batch, or returns its stored outcome if it already ran. */
export async function processStudentImportBatch(id: string, batchIndex: number): Promise<StudentRecordResult<ImportBatchResult>> {
  if (!sessionId.safeParse(id).success || !Number.isInteger(batchIndex) || batchIndex < 0) return failure("validation");
  const db = await client();
  if (!db) return failure("forbidden");
  try {
    const { data, error } = await db.rpc("process_student_import_batch", { p_session_id: id, p_batch_index: batchIndex });
    if (error) return failureFromDatabase(error);
    const result = batchSchema.parse(data);
    revalidatePath("/app/[academySlug]/students", "page");
    return {
      ok: true,
      data: {
        state: result.state, blockedReason: result.blocked_reason, created: result.created, skipped: result.skipped,
        failed: result.failed, pending: result.pending, nextBatch: result.next_batch,
      },
    };
  } catch {
    return failure("unavailable");
  }
}

/** Discards an unconfirmed import. No student records were created by it. */
export async function cancelStudentImport(id: string): Promise<StudentRecordResult<null>> {
  if (!sessionId.safeParse(id).success) return failure("not_found");
  const db = await client();
  if (!db) return failure("forbidden");
  try {
    const { error } = await db.rpc("cancel_student_import", { p_session_id: id });
    if (error) return failureFromDatabase(error);
    return { ok: true, data: null };
  } catch {
    return failure("unavailable");
  }
}
