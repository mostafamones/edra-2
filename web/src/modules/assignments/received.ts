import "server-only";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/lib/supabase/database.types";
import { academyMember } from "@/lib/supabase/membership";
import { failure, failureFromDatabase } from "./errors";
import { PREVIEWABLE_TYPES } from "./student/files";
import type { AssignmentFailure } from "./types";

/**
 * Staff review of accepted online Written Work. The database checks the live staff role and that
 * the file belongs to an accepted submission in this academy; only then is a short-lived private
 * URL signed with the server credential. Drafts are never listed.
 */

const FILE_URL_SECONDS = 60;
const files = z.object({
  submittedAt: z.string().nullable(),
  files: z.array(z.object({ id: z.guid(), partId: z.guid(), name: z.string(), size: z.number(), mime: z.string() })),
});
export type ReceivedFiles = z.infer<typeof files>;

export async function listReceivedFiles(input: { academyId: string; assignmentId: string; recordId: string }): Promise<{ ok: true; data: ReceivedFiles } | AssignmentFailure> {
  const parsed = z.object({ academyId: z.guid(), assignmentId: z.guid(), recordId: z.guid() }).safeParse(input);
  if (!parsed.success) return failure("validation");
  const caller = await academyMember(parsed.data.academyId);
  if (!caller) return failure("forbidden");
  try {
    const { data, error } = await caller.db.rpc("list_assignment_received_files", {
      p_academy_id: parsed.data.academyId, p_assignment_id: parsed.data.assignmentId, p_record_id: parsed.data.recordId,
    });
    if (error) return failureFromDatabase(error);
    return { ok: true, data: files.parse(data) };
  } catch {
    return failure("unavailable");
  }
}

export async function openReceivedFile(input: { academyId: string; fileId: string }): Promise<{ ok: true; url: string } | AssignmentFailure> {
  const parsed = z.object({ academyId: z.guid(), fileId: z.guid() }).safeParse(input);
  if (!parsed.success) return failure("validation");
  const caller = await academyMember(parsed.data.academyId);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!caller) return failure("forbidden");
  if (!key) return failure("unavailable");
  try {
    const { data, error } = await caller.db.rpc("authorize_assignment_received_file", { p_academy_id: parsed.data.academyId, p_file_id: parsed.data.fileId });
    if (error) return failureFromDatabase(error);
    const file = z.object({ path: z.string(), name: z.string(), mime: z.string() }).parse(data);
    const admin = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const signed = await admin.storage.from("assignment-work").createSignedUrl(file.path, FILE_URL_SECONDS, PREVIEWABLE_TYPES.includes(file.mime) ? undefined : { download: file.name });
    if (signed.error || !signed.data) return failure("unavailable");
    return { ok: true, url: signed.data.signedUrl };
  } catch {
    return failure("unavailable");
  }
}

const access = z.object({
  hasAnswerVideos: z.boolean(), qualifyingWork: z.boolean(), revoked: z.boolean(),
  history: z.array(z.object({ action: z.enum(["revoke", "restore"]), reason: z.string(), createdAt: z.string(), actor: z.string() })),
});
export type AnswerAccess = z.infer<typeof access>;
const accessInput = z.object({ academyId: z.guid(), assignmentId: z.guid(), recordId: z.guid() });

/** A student's earned answer-video access for this assignment, with its revoke/restore history. */
export async function getAnswerAccess(input: z.input<typeof accessInput>): Promise<{ ok: true; data: AnswerAccess } | AssignmentFailure> {
  const parsed = accessInput.safeParse(input);
  if (!parsed.success) return failure("validation");
  const caller = await academyMember(parsed.data.academyId);
  if (!caller) return failure("forbidden");
  try {
    const { data, error } = await caller.db.rpc("get_assignment_answer_access", {
      p_academy_id: parsed.data.academyId, p_assignment_id: parsed.data.assignmentId, p_record_id: parsed.data.recordId,
    });
    if (error) return failureFromDatabase(error);
    return { ok: true, data: access.parse(data) };
  } catch {
    return failure("unavailable");
  }
}

const changeInput = accessInput.extend({ action: z.enum(["revoke", "restore"]), reason: z.string().trim().min(1).max(1000), requestId: z.guid() });

/** Owner/Head Admin/Admin revoke answer access for invalid qualifying work, or restore it while that work remains valid. */
export async function changeAnswerAccess(input: z.input<typeof changeInput>): Promise<{ ok: true; data: AnswerAccess } | AssignmentFailure> {
  const parsed = changeInput.safeParse(input);
  if (!parsed.success) return failure("validation");
  const { academyId, assignmentId, recordId, action, reason, requestId } = parsed.data;
  const caller = await academyMember(academyId);
  if (!caller) return failure("forbidden");
  try {
    const { data, error } = await caller.db.rpc("change_assignment_answer_access", {
      p_academy_id: academyId, p_assignment_id: assignmentId, p_record_id: recordId, p_action: action, p_reason: reason, p_request_id: requestId,
    });
    if (error) return failureFromDatabase(error);
    return { ok: true, data: access.parse(data) };
  } catch {
    return failure("unavailable");
  }
}

export async function getOnlineSetting(academyId: string): Promise<{ ok: true; enabled: boolean; version: number } | AssignmentFailure> {
  return setting(academyId, null, null);
}

export async function setOnlineSetting(input: { academyId: string; enabled: boolean; version: number }) {
  const parsed = z.object({ academyId: z.guid(), enabled: z.boolean(), version: z.number().int().min(1) }).safeParse(input);
  if (!parsed.success) return failure("validation");
  return setting(parsed.data.academyId, parsed.data.enabled, parsed.data.version);
}

async function setting(academyId: string, enabled: boolean | null, version: number | null): Promise<{ ok: true; enabled: boolean; version: number } | AssignmentFailure> {
  if (!z.guid().safeParse(academyId).success) return failure("validation");
  const caller = await academyMember(academyId);
  if (!caller) return failure("forbidden");
  try {
    const { data, error } = await caller.db.rpc("assignment_online_setting", {
      p_academy_id: academyId, ...(enabled === null ? {} : { p_enabled: enabled, p_version: version! }),
    });
    if (error) return failureFromDatabase(error);
    return { ok: true, ...z.object({ enabled: z.boolean(), version: z.number().int() }).parse(data) };
  } catch {
    return failure("unavailable");
  }
}
