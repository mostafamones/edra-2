import "@tanstack/react-start/server-only";

import { z } from "zod";

import { staffContext } from "./data";
import { failure, failureFromDatabase } from "./errors";
import { canManageStudentSuspension } from "./permissions";
import type { StudentRecordResult, SuspensionOutcome, SuspensionPreviewRow } from "./types";
import { MAX_SUSPENSION_TARGETS, suspensionReasonSchema } from "./validation";

const recordIds = z.array(z.guid()).min(1).max(MAX_SUSPENSION_TARGETS)
  .transform((ids) => [...new Set(ids.map((id) => id.toLowerCase()))]);

const previewInput = z.object({ academyId: z.guid(), recordIds });

const previewRows = z.array(z.object({
  record_id: z.string(), profile_id: z.string(), full_name: z.string(), archived: z.boolean(), year_closed: z.boolean(),
  connected: z.boolean(), suspended: z.boolean(), revision: z.number().int().nonnegative(),
}));

/**
 * Fresh suspension state of each selected record's academy profile, read just before confirmation.
 * Records in any year or archive state; missing ones are left out, so the caller can tell.
 */
export async function previewStudentSuspension(value: unknown): Promise<StudentRecordResult<SuspensionPreviewRow[]>> {
  const parsed = previewInput.safeParse(value);
  if (!parsed.success) return failure("validation");
  const actor = await staffContext(parsed.data.academyId);
  if (!actor || !canManageStudentSuspension(actor.role)) return failure("forbidden");
  try {
    const { data, error } = await actor.db.rpc("preview_student_access_suspension", { p_academy_id: parsed.data.academyId, p_record_ids: parsed.data.recordIds });
    if (error) return failureFromDatabase(error);
    return {
      ok: true,
      data: previewRows.parse(data).map((row) => ({
        recordId: row.record_id, profileId: row.profile_id, fullName: row.full_name, archived: row.archived, yearClosed: row.year_closed,
        connected: row.connected, suspended: row.suspended, revision: row.revision,
      })),
    };
  } catch {
    return failure("unavailable");
  }
}

const setInput = z.object({
  academyId: z.guid(),
  records: z.array(z.object({ id: z.guid(), revision: z.number().int().nonnegative() })).min(1).max(MAX_SUSPENSION_TARGETS),
  suspended: z.boolean(),
  reason: suspensionReasonSchema,
});

const outcomeEntry = z.object({ record_id: z.string(), profile_id: z.string(), revision: z.number().int() })
  .transform((entry) => ({ recordId: entry.record_id, profileId: entry.profile_id, revision: entry.revision }));
const outcome = z.object({ changed: z.array(outcomeEntry), unchanged: z.array(outcomeEntry) });

/**
 * Sets manual online-access suspension for the profiles of explicit records, individually or in bulk,
 * with one optional reason. All-or-nothing: a missing, foreign or stale target rejects the whole call.
 * Profiles already in the desired state are reported unchanged. The actor comes from the session.
 */
export async function setStudentSuspension(value: unknown): Promise<StudentRecordResult<SuspensionOutcome>> {
  const parsed = setInput.safeParse(value);
  if (!parsed.success) return failure("validation");
  const { academyId, records, suspended, reason } = parsed.data;
  const actor = await staffContext(academyId);
  if (!actor || !canManageStudentSuspension(actor.role)) return failure("forbidden");
  try {
    const { data, error } = await actor.db.rpc("set_student_access_suspension", {
      p_academy_id: academyId,
      p_records: records.map((record) => ({ id: record.id.toLowerCase(), revision: record.revision })),
      p_suspended: suspended,
      // NULL is no reason; the generator types the argument as non-null.
      p_reason: reason as string,
    });
    if (error) return failureFromDatabase(error);
    return { ok: true, data: outcome.parse(data) };
  } catch {
    return failure("unavailable");
  }
}
