import "@tanstack/react-start/server-only";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { publicEnv } from "@/lib/env/public";
import { cookieAuthority } from "@/lib/supabase/authority";
import type { Database } from "@/lib/supabase/database.types";
import { CONCERN_LIMITS, type ConcernAttachment } from "./contracts";
import { concernFailure, concernFailureFromDatabase, type ConcernFailure } from "./errors";
import { INLINE_IMAGE_TYPES, sniffFile, sniffVoice, VOICE_TYPES, voiceDuration } from "./probe";
import { runConcernCommand } from "./server";
import { attachmentInput, reserveAttachmentInput } from "./validation";

/**
 * Concern media on the trusted server. Browsers never hold Storage credentials for this bucket: the
 * caller's database session authorizes each step, and the service role only reads/writes bytes the
 * database has just authorized.
 */
const BUCKET = "concern-media";

const recordSchema = z.object({
  id: z.guid(), name: z.string(), contentType: z.string().nullable(), bytes: z.number().int(), kind: z.enum(["file", "voice"]),
  durationSeconds: z.number().nullable(), state: z.enum(["pending", "ready", "bound", "removed"]), path: z.string(),
});
type MediaRecord = z.infer<typeof recordSchema>;
const descriptor = ({ id, name, contentType, bytes, kind, durationSeconds }: MediaRecord): ConcernAttachment =>
  ({ id, name, contentType: contentType ?? "application/octet-stream", bytes, kind, durationSeconds });

function serviceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}
function storageAdmin() {
  const key = serviceKey();
  return key ? createClient<Database>(publicEnv.supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}
/** Reads stored bytes with the same headers supabase-js uses, so a Range request reaches Storage. */
function readObject(path: string, range?: string) {
  const key = serviceKey()!;
  const url = `${publicEnv.supabaseUrl}/storage/v1/object/authenticated/${BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
  return fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}`, ...(range && { Range: range }) } });
}

export type StartUploadResult = { ok: true; url: string | null } | ConcernFailure;
export type FinishUploadResult = { ok: true; attachment: ConcernAttachment } | ConcernFailure;

/**
 * Reserves an upload (retry-safe by attachment id) and issues a one-time signed URL for a fresh
 * object. `url` is null when the bytes were already accepted by an earlier attempt.
 */
export async function startConcernUpload(value: unknown): Promise<StartUploadResult> {
  const parsed = reserveAttachmentInput.safeParse(value);
  if (!parsed.success) return concernFailure(value && typeof value === "object" && "bytes" in value
    && Number(value.bytes) > CONCERN_LIMITS.attachmentBytes ? "attachment_too_large" : "validation");
  const admin = storageAdmin();
  if (!admin) return concernFailure("unavailable");
  const v = parsed.data;
  const reserved = await runConcernCommand((db) => db.rpc("reserve_concern_attachment", {
    p_academy_id: v.academyId, p_concern_id: v.concernId, p_attachment_id: v.attachmentId, p_kind: v.kind, p_name: v.name, p_bytes: v.bytes,
  }), (data) => recordSchema.parse(data));
  if ("ok" in reserved) return reserved;
  if (reserved.state === "ready") return { ok: true, url: null };
  try {
    const signed = await admin.storage.from(BUCKET).createSignedUploadUrl(reserved.path);
    if (!signed.error && signed.data) return { ok: true, url: signed.data.signedUrl };
    // Without upsert, signing may refuse a path whose bytes an earlier attempt already stored.
    // Never overwrite them: send the client straight to verification of what is there.
    const existing = await readObject(reserved.path, "bytes=0-0");
    await existing.body?.cancel();
    return existing.ok ? { ok: true, url: null } : concernFailure("unavailable");
  } catch {
    return concernFailure("unavailable");
  }
}

/** Server-side acceptance after the upload: real size, real type and, for voice, the container's own duration. */
export async function finishConcernUpload(value: unknown): Promise<FinishUploadResult> {
  const parsed = attachmentInput.safeParse(value);
  if (!parsed.success) return concernFailure("validation");
  const admin = storageAdmin();
  if (!admin) return concernFailure("unavailable");
  const v = parsed.data;
  const record = await runConcernCommand((db) => db.rpc("concern_attachment_upload", {
    p_academy_id: v.academyId, p_concern_id: v.concernId, p_attachment_id: v.attachmentId,
  }), (data) => recordSchema.parse(data));
  if ("ok" in record) return record;
  if (record.state === "ready") return { ok: true, attachment: descriptor(record) };
  try {
    const voice = record.kind === "voice";
    // Files only need their leading bytes and total size; voice notes are parsed whole (at most 25 MB).
    const response = await readObject(record.path, voice ? undefined : "bytes=0-63");
    if (response.status === 404 || response.status === 400) return concernFailure("attachment_unavailable");
    if (!response.ok) return concernFailure("unavailable");
    const total = Number(response.headers.get("content-range")?.split("/")[1] ?? response.headers.get("content-length"));
    const bytes = new Uint8Array(await response.arrayBuffer());
    const size = voice || response.status === 200 ? bytes.length : total;
    const verify = (accept: boolean, contentType: string | null, duration: number | null = null) => admin.rpc("verify_concern_attachment", {
      p_attachment_id: record.id, p_accept: accept, p_content_type: contentType as string,
      // The measured length, rounded up to the stored precision (never understated, never above the checked limit).
      ...(duration !== null && { p_duration_seconds: Math.min(Math.ceil(duration * 100) / 100, CONCERN_LIMITS.voiceSeconds) }),
    });
    const reject = async (code: "attachment_unavailable" | "unsupported_media" | "voice_too_long") => {
      await verify(false, null);
      return concernFailure(code);
    };
    if (size !== record.bytes || size > CONCERN_LIMITS.attachmentBytes) return reject("attachment_unavailable");
    let contentType: string;
    let duration: number | null = null;
    if (voice) {
      const type = sniffVoice(bytes);
      duration = type && voiceDuration(bytes, type);
      if (!type || duration === null) return reject("unsupported_media");
      if (duration > CONCERN_LIMITS.voiceSeconds) return reject("voice_too_long");
      contentType = type;
    } else contentType = sniffFile(bytes);
    const accepted = await verify(true, contentType, duration);
    if (accepted.error) return concernFailureFromDatabase(accepted.error);
    return { ok: true, attachment: descriptor(recordSchema.parse(accepted.data)) };
  } catch {
    return concernFailure("unavailable");
  }
}

/** Cancels the caller's own unsent upload. Sent media are unaffected. */
export async function discardConcernUpload(value: unknown): Promise<{ ok: true } | ConcernFailure> {
  const parsed = attachmentInput.safeParse(value);
  if (!parsed.success) return concernFailure("validation");
  const v = parsed.data;
  const result = await runConcernCommand((db) => db.rpc("discard_concern_attachment", {
    p_academy_id: v.academyId, p_concern_id: v.concernId, p_attachment_id: v.attachmentId,
  }), () => ({ ok: true as const }));
  return result;
}

/**
 * Deletes one leased batch of removed objects (discarded, rejected, expired, or from deleted
 * messages) whose upload URLs have all expired, returning how many were purged. Retrieval already
 * stopped when they were removed; this only reclaims bytes.
 */
export async function purgeConcernMedia(limit = 50): Promise<number> {
  const admin = storageAdmin();
  if (!admin) return 0;
  try {
    const { data, error } = await admin.rpc("claim_concern_media_purge", { p_limit: limit });
    if (error) return 0;
    const batch = z.array(z.object({ id: z.guid(), path: z.string() })).parse(data);
    if (batch.length === 0) return 0;
    const removed = await admin.storage.from(BUCKET).remove(batch.map((entry) => entry.path));
    if (removed.error) return 0;
    const completed = await admin.rpc("complete_concern_media_purge", { p_ids: batch.map((entry) => entry.id) });
    return completed.error ? 0 : batch.length;
  } catch {
    return 0; // The lease expires after 10 minutes and a later run retries.
  }
}

/**
 * Scheduled maintenance (Worker Cron Trigger, see wrangler.jsonc): purges up to `rounds` full
 * batches without waiting for user traffic. Needs the `SUPABASE_SERVICE_ROLE_KEY` Worker secret.
 */
export async function runConcernMediaMaintenance(rounds = 10, limit = 50) {
  let purged = 0;
  for (let round = 0; round < rounds; round++) {
    const count = await purgeConcernMedia(limit);
    purged += count;
    if (count < limit) break;
  }
  return purged;
}

const inlineTypes: readonly string[] = [...INLINE_IMAGE_TYPES, "application/pdf"];
const disposition = (kind: "inline" | "attachment", name: string) => {
  const fallback = name.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${kind}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
};
const plain = (status: number) => new Response(null, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });

/**
 * Authenticated same-origin media delivery. Every request (including each Range request while
 * seeking) rechecks current academy membership, concern participation and that the message is not
 * deleted. Nothing is publicly or durably cacheable, and only proven image/PDF/voice types render inline.
 */
export async function serveConcernMedia(request: Request, params: { academyId: string; concernId: string; attachmentId: string }) {
  const ids = z.object({ academyId: z.guid(), concernId: z.guid(), attachmentId: z.guid() }).safeParse(params);
  if (!ids.success) return plain(404);
  const caller = await cookieAuthority();
  if (!caller) return plain(401);
  if (!serviceKey()) return plain(503);
  const { academyId, concernId, attachmentId } = ids.data;
  let record: MediaRecord;
  try {
    const { data, error } = await caller.db.rpc("concern_attachment_access", { p_academy_id: academyId, p_concern_id: concernId, p_attachment_id: attachmentId });
    if (error) return plain(concernFailureFromDatabase(error).code === "unavailable" ? 503 : 404);
    record = recordSchema.parse(data);
  } catch {
    return plain(503);
  }
  const range = request.headers.get("range");
  let upstream: Response;
  try {
    upstream = await readObject(record.path, range && /^bytes=\d*-\d*$/.test(range) ? range : undefined);
  } catch {
    return plain(502);
  }
  if (upstream.status === 416) return plain(416);
  if (!upstream.ok) return plain(upstream.status === 404 ? 404 : 502);
  const type = record.contentType ?? "application/octet-stream";
  const download = new URL(request.url).searchParams.has("download");
  const inline = !download && (record.kind === "voice" ? (VOICE_TYPES as readonly string[]).includes(type) : inlineTypes.includes(type));
  const headers = new Headers({
    "Content-Type": inline ? type : "application/octet-stream",
    "Content-Disposition": disposition(inline ? "inline" : "attachment", record.name),
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
    "Accept-Ranges": "bytes",
  });
  // Browser PDF viewers do not run in a sandboxed document; every other response is sandboxed.
  if (type !== "application/pdf" || !inline) headers.set("Content-Security-Policy", "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");
  for (const name of ["content-length", "content-range"]) { const value = upstream.headers.get(name); if (value) headers.set(name, value); }
  return new Response(upstream.body, { status: upstream.status === 206 ? 206 : 200, headers });
}
