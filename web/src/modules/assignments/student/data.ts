import "server-only";

import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { IMAGE_BUCKET, imagePath } from "@/components/shared/assessment/images/tokens";
import { cookieAuthority, type Db } from "@/lib/supabase/authority";
import type { Database, Json } from "@/lib/supabase/database.types";
import { detectWorkFile } from "./content";
import { studentAssignmentFailure, studentAssignmentFailureFromDatabase } from "./errors";
import { sameWorkFileType, WORK_FILE_MAX_BYTES, WORK_FILE_TYPES } from "./files";
import {
  assignmentSchema, claimSchema, editorSchema, pageSchema, type ClaimOutcome, type EditorDocument, type StudentAssignment,
  type StudentAssignmentPage, type StudentAssignmentResult,
} from "./types";

/**
 * Student assignment operations for the cookie web boundary. Every call runs as the signed-in
 * account; the database resolves the open-year annual record and re-checks academy, suspension,
 * audience, closure, entitlement, source/result locks and the editor claim. Academy and assignment
 * ids only locate work. Responses are per-account allowlisted DTOs.
 */

export const WORK_BUCKET = "assignment-work";
const IMAGE_URL_SECONDS = 60;
const FILE_URL_SECONDS = 60;
type DatabaseError = { code?: string; message?: string };

/** Server-only Storage credential: students and staff have no client Storage grants on these buckets. */
export function storageAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function call<T>(run: (db: Db) => PromiseLike<{ data: unknown; error: DatabaseError | null }>, parse: (value: unknown) => T): Promise<StudentAssignmentResult<T>> {
  const caller = await cookieAuthority();
  if (!caller) return studentAssignmentFailure("forbidden");
  try {
    const { data, error } = await run(caller.db);
    if (error) return studentAssignmentFailureFromDatabase(error);
    return { ok: true, data: parse(data) };
  } catch {
    return studentAssignmentFailure("unavailable");
  }
}

export const STUDENT_ASSIGNMENT_PAGE_SIZE = 25;
const listInput = z.object({ academyId: z.guid(), page: z.number().int().min(1).max(4000), search: z.string().max(100), unitId: z.guid().optional() });

/** One page of the caller's assignments in the academy, optionally only those of one content unit. */
export async function listMyAssignments(input: { academyId: string; page: number; search: string; unitId?: string }): Promise<StudentAssignmentResult<StudentAssignmentPage>> {
  const parsed = listInput.safeParse(input);
  if (!parsed.success) return studentAssignmentFailure("validation");
  const { academyId, page, search, unitId } = parsed.data;
  return call((db) => db.rpc("list_my_assignments", {
    p_academy_id: academyId, p_offset: (page - 1) * STUDENT_ASSIGNMENT_PAGE_SIZE, p_search: search.trim(), ...(unitId && { p_unit_id: unitId }),
  }), (value) => pageSchema.parse(value));
}

const assignmentInput = z.object({ academyId: z.guid(), assignmentId: z.guid() });

/** Metadata and action state only. Reading never creates a draft, selects a source or claims the editor. */
export async function getMyAssignment(input: { academyId: string; assignmentId: string }): Promise<StudentAssignmentResult<StudentAssignment>> {
  const parsed = assignmentInput.safeParse(input);
  if (!parsed.success) return studentAssignmentFailure("not_found");
  return call((db) => db.rpc("get_my_assignment", { p_academy_id: parsed.data.academyId, p_assignment_id: parsed.data.assignmentId }),
    (value) => assignmentSchema.parse(value));
}

const editor = assignmentInput.extend({ token: z.guid() });
const fenced = editor.extend({ generation: z.number().int().positive(), key: z.guid() });
const version = z.number().int().min(0).max(2_147_483_647);
export const commandSchema = z.discriminatedUnion("operation", [
  editor.extend({ operation: z.literal("claim"), transfer: z.boolean().optional() }).strict(),
  editor.extend({ operation: z.literal("renew") }).strict(),
  editor.extend({ operation: z.literal("read") }).strict(),
  fenced.extend({
    operation: z.literal("save"), version,
    answers: z.record(z.guid(), z.guid().nullable()).refine((value) => { const size = Object.keys(value).length; return size >= 1 && size <= 300; }),
  }).strict(),
  fenced.extend({ operation: z.literal("submit"), version, scoringRevision: z.number().int().positive() }).strict(),
  fenced.extend({
    operation: z.literal("register"), partId: z.guid(), name: z.string().trim().min(1).max(250),
    mime: z.enum(WORK_FILE_TYPES), size: z.number().int().min(1).max(WORK_FILE_MAX_BYTES),
  }).strict(),
  fenced.extend({ operation: z.literal("finish"), fileId: z.guid() }).strict(),
  fenced.extend({ operation: z.literal("remove"), fileId: z.guid() }).strict(),
]);
export type AssignmentCommand = z.infer<typeof commandSchema>;

/** Paths stay on the server: they locate bytes for validation and cleanup only. */
function publicDocument(value: unknown): EditorDocument {
  const doc = editorSchema.parse(value);
  return { ...doc, files: doc.files.map(({ id, partId, name, size, mime, state }) => ({ id, partId, name, size, mime, state })) };
}

function rpcCommand(db: Db, command: AssignmentCommand) {
  return db.rpc("assignment_student_command", { p_input: command as unknown as Json });
}

export async function runAssignmentCommand(value: unknown): Promise<StudentAssignmentResult<unknown>> {
  const parsed = commandSchema.safeParse(value);
  if (!parsed.success) return studentAssignmentFailure("validation");
  const command = parsed.data;
  const parse = (data: unknown): unknown => {
    if (command.operation === "claim") {
      const outcome = claimSchema.parse(data);
      return ("busy" in outcome ? outcome : publicDocument(outcome)) satisfies ClaimOutcome;
    }
    if (command.operation === "read") return publicDocument(data);
    if (command.operation === "submit") return assignmentSchema.parse(data);
    if (command.operation === "register") return z.object({ fileId: z.guid(), path: z.string() }).parse(data);
    return data;
  };
  return call((db) => rpcCommand(db, command), parse);
}

/** Starts one Written Work upload: a pending owned file row and a signed one-time upload URL for a fresh object. */
export async function startWorkUpload(value: unknown): Promise<StudentAssignmentResult<{ fileId: string; url: string }>> {
  const parsed = commandSchema.safeParse(value);
  if (!parsed.success || parsed.data.operation !== "register") return studentAssignmentFailure("validation");
  const admin = storageAdmin();
  if (!admin) return studentAssignmentFailure("unavailable");
  const registered = await call((db) => rpcCommand(db, parsed.data), (data) => z.object({ fileId: z.guid(), path: z.string() }).parse(data));
  if (!registered.ok) return registered;
  const signed = await admin.storage.from(WORK_BUCKET).createSignedUploadUrl(registered.data.path);
  if (signed.error || !signed.data) return studentAssignmentFailure("unavailable");
  return { ok: true, data: { fileId: registered.data.fileId, url: signed.data.signedUrl } };
}

/**
 * Accepts uploaded bytes: the server reads the caller's own pending object, checks its real type
 * and size, attests its digest, then the student's fenced finish command accepts it. Invalid
 * bytes are removed from the draft and deleted.
 */
export async function finishWorkUpload(value: unknown): Promise<StudentAssignmentResult<EditorDocument>> {
  const parsed = commandSchema.safeParse(value);
  if (!parsed.success || parsed.data.operation !== "finish") return studentAssignmentFailure("validation");
  const command = parsed.data;
  const admin = storageAdmin();
  const caller = await cookieAuthority();
  if (!caller) return studentAssignmentFailure("forbidden");
  if (!admin) return studentAssignmentFailure("unavailable");
  const base = { academyId: command.academyId, assignmentId: command.assignmentId, token: command.token };
  try {
    const read = await rpcCommand(caller.db, { ...base, operation: "read" });
    if (read.error) return studentAssignmentFailureFromDatabase(read.error);
    const doc = editorSchema.parse(read.data);
    const file = doc.files.find((entry) => entry.id === command.fileId && entry.state === "pending");
    if (!file || doc.generation !== command.generation) return studentAssignmentFailure("file_unavailable");
    const download = await admin.storage.from(WORK_BUCKET).download(file.path);
    if (download.error || !download.data) return studentAssignmentFailure("file_unavailable");
    const bytes = new Uint8Array(await download.data.arrayBuffer());
    const type = bytes.length === file.size && bytes.length <= WORK_FILE_MAX_BYTES ? await detectWorkFile(bytes) : null;
    if (!type || !sameWorkFileType(type, file.mime)) {
      await rpcCommand(caller.db, { ...base, operation: "remove", generation: command.generation, key: crypto.randomUUID(), fileId: file.id });
      await cleanupWorkFiles(command.academyId, command.assignmentId);
      return studentAssignmentFailure("unsupported_file");
    }
    const digest = createHash("sha256").update(bytes).digest("hex");
    const attested = await admin.rpc("attest_assignment_upload", { p_file_id: file.id, p_sha256: digest, p_size: file.size, p_mime: file.mime });
    if (attested.error) return studentAssignmentFailureFromDatabase(attested.error);
    const finished = await rpcCommand(caller.db, command);
    if (finished.error) return studentAssignmentFailureFromDatabase(finished.error);
    const next = await rpcCommand(caller.db, { ...base, operation: "read" });
    if (next.error) return studentAssignmentFailureFromDatabase(next.error);
    return { ok: true, data: publicDocument(next.data) };
  } catch {
    return studentAssignmentFailure("unavailable");
  }
}

/** Deletes the caller's removed or abandoned draft objects in small reserved batches. Never accepted files. */
export async function cleanupWorkFiles(academyId: string, assignmentId: string) {
  const admin = storageAdmin();
  const caller = await cookieAuthority();
  if (!admin || !caller) return;
  try {
    let completed: string[] = [];
    for (let round = 0; round < 3; round++) {
      const { data, error } = await caller.db.rpc("assignment_file_cleanup", { p_academy_id: academyId, p_assignment_id: assignmentId, p_completed: completed });
      if (error) return;
      const batch = z.array(z.object({ id: z.guid(), path: z.string() })).parse(data).filter((entry) => !completed.includes(entry.id));
      if (batch.length === 0) return;
      const removed = await admin.storage.from(WORK_BUCKET).remove(batch.map((entry) => entry.path));
      if (removed.error) return;
      completed = batch.map((entry) => entry.id);
    }
  } catch { /* Best effort: a later call retries reserved deletions. */ }
}

const imagesInput = editor.extend({ imageIds: z.array(z.guid()).min(1).max(20) });

/** Short-lived URLs for question images in the caller's current editing document only. */
export async function signWorkImages(value: unknown): Promise<StudentAssignmentResult<Record<string, string>>> {
  const parsed = imagesInput.safeParse(value);
  if (!parsed.success) return studentAssignmentFailure("validation");
  const { academyId, assignmentId, token, imageIds } = parsed.data;
  const authorized = await call((db) => db.rpc("authorize_my_assignment_images", {
    p_input: { academyId, assignmentId, token }, p_ids: [...new Set(imageIds)],
  }), (data) => z.array(z.guid()).parse(data ?? []));
  if (!authorized.ok) return authorized;
  const urls: Record<string, string> = {};
  if (authorized.data.length === 0) return { ok: true, data: urls };
  const admin = storageAdmin();
  if (!admin) return studentAssignmentFailure("unavailable");
  const signed = await admin.storage.from(IMAGE_BUCKET).createSignedUrls(authorized.data.map((id) => imagePath(academyId, id)), IMAGE_URL_SECONDS);
  if (signed.error) return studentAssignmentFailure("unavailable");
  signed.data.forEach((entry, index) => { if (!entry.error && entry.signedUrl) urls[authorized.data[index]] = entry.signedUrl; });
  return { ok: true, data: urls };
}

export const STUDENT_IMAGE_URL_SECONDS = IMAGE_URL_SECONDS;
export const RECEIVED_FILE_URL_SECONDS = FILE_URL_SECONDS;
