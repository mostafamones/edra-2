"use server";

import { randomUUID } from "node:crypto";

import { cookieAuthority, type Authority } from "../../lib/supabase/authority";

import { encodeAvatar } from "./image";
import { profileSchema } from "./validation";

export type ProfileResult =
  | { ok: true; fullName: string; displayName: string | null }
  | { ok: false; message: string; fieldErrors?: { fullName?: string; displayName?: string } };

export type AvatarResult = { ok: true; avatarPath: string | null } | { ok: false; message: string; avatarPath?: string | null };

const BUCKET = "avatars";
/** Unfinished uploads younger than this may still be finalizing in another tab. */
const PENDING_UPLOAD_MS = 10 * 60 * 1000;
/** Bounds storage if uploads keep failing before finalization. */
const MAX_PENDING_UPLOADS = 3;

const SIGNED_OUT = "Your session has ended. Sign in again.";

/** Saves the caller's full name and optional display name together. */
export async function saveProfile(input: unknown): Promise<ProfileResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors;
    return { ok: false, message: "Check the highlighted fields.", fieldErrors: { fullName: fields.fullName?.[0], displayName: fields.displayName?.[0] } };
  }
  const authority = await cookieAuthority();
  if (!authority) return { ok: false, message: SIGNED_OUT };
  const { data, error } = await authority.db.from("profiles")
    .update({ full_name: parsed.data.fullName, display_name: parsed.data.displayName })
    .eq("id", authority.userId)
    .select("full_name, display_name")
    .maybeSingle();
  if (error || !data) return { ok: false, message: "Couldn’t save your profile. Try again." };
  return { ok: true, fullName: data.full_name ?? parsed.data.fullName, displayName: data.display_name };
}

async function currentAvatar({ db, userId }: Authority) {
  const { data, error } = await db.from("profiles").select("avatar_path").eq("id", userId).maybeSingle();
  if (error || !data) throw new Error("profile_unavailable");
  return data.avatar_path;
}

/**
 * Deletes objects in the caller's folder that are neither the current avatar nor a recent upload
 * that may still be finalizing, and reports how many recent uploads remain. Storage itself is the
 * retry record: an object whose deletion failed is found and removed by the next avatar action.
 */
async function reconcile({ db, userId }: Authority, current: string | null) {
  const { data, error } = await db.storage.from(BUCKET).list(userId, { limit: 100 });
  if (error) return { pending: 0 };
  const stale: string[] = [];
  let pending = 0;
  for (const object of data) {
    const path = `${userId}/${object.name}`;
    if (path === current) continue;
    const created = Date.parse(object.created_at ?? "");
    if (Number.isFinite(created) && Date.now() - created < PENDING_UPLOAD_MS) pending += 1;
    else stale.push(path);
  }
  if (stale.length) await db.storage.from(BUCKET).remove(stale);
  return { pending };
}

/** `settled` is false when the switch's outcome is unknown, so the new upload must be kept. */
async function finalize(authority: Authority, path: string | null, expected: string | null): Promise<AvatarResult & { settled: boolean }> {
  const { data, error } = await authority.db.rpc("set_my_avatar", { p_path: path as string, p_expected: expected as string });
  const outcome = data as { result?: string; previous?: string | null; current?: string | null } | null;
  if (error) {
    // The switch may have committed before the response was lost: trust the stored value.
    const stored = await currentAvatar(authority).catch(() => undefined);
    if (stored === path) return { ok: true, avatarPath: path, settled: true };
    // Unknown: keep the upload; reconciliation removes it later unless it became current.
    return { ok: false, message: "Couldn’t save your picture. Try again.", settled: stored !== undefined };
  }
  if (outcome?.result === "saved") {
    if (outcome.previous) await authority.db.storage.from(BUCKET).remove([outcome.previous]);
    return { ok: true, avatarPath: path, settled: true };
  }
  if (outcome?.result === "conflict") {
    return { ok: false, message: "Your picture was changed somewhere else. Review it and try again.", avatarPath: outcome.current ?? null, settled: true };
  }
  if (outcome?.result === "unauthenticated") return { ok: false, message: SIGNED_OUT, settled: true };
  return { ok: false, message: "Couldn’t save your picture. Try again.", settled: true };
}

/**
 * Stores the browser's final square crop as a new immutable object and switches the profile to it
 * only if the avatar is still `expected`. A losing or failed switch removes its own upload.
 */
export async function uploadAvatar(form: FormData): Promise<AvatarResult> {
  const file = form.get("file");
  const expected = form.get("expected");
  if (!(file instanceof Blob) || (expected !== null && typeof expected !== "string")) {
    return { ok: false, message: "Choose an image to upload." };
  }
  const authority = await cookieAuthority();
  if (!authority) return { ok: false, message: SIGNED_OUT };

  const encoded = await encodeAvatar(new Uint8Array(await file.arrayBuffer()));
  if (!encoded) return { ok: false, message: "This image can’t be used. Choose a JPEG, PNG or WebP image." };

  let current: string | null;
  try {
    current = await currentAvatar(authority);
  } catch {
    return { ok: false, message: "Couldn’t save your picture. Try again." };
  }
  const { pending } = await reconcile(authority, current);
  if (pending >= MAX_PENDING_UPLOADS) return { ok: false, message: "Too many uploads in progress. Try again in a few minutes." };

  const path = `${authority.userId}/${randomUUID()}.webp`;
  const uploaded = await authority.db.storage.from(BUCKET).upload(path, encoded, { contentType: "image/webp", upsert: false });
  if (uploaded.error) return { ok: false, message: "Couldn’t upload your picture. Try again." };

  const { settled, ...result } = await finalize(authority, path, expected || null);
  if (!result.ok && settled) await authority.db.storage.from(BUCKET).remove([path]);
  return result;
}

/** Removes the caller's picture if it is still `expected`, restoring the initials fallback. */
export async function removeAvatar(expected: string | null): Promise<AvatarResult> {
  if (expected !== null && typeof expected !== "string") return { ok: false, message: "Couldn’t remove your picture." };
  const authority = await cookieAuthority();
  if (!authority) return { ok: false, message: SIGNED_OUT };
  const result = await finalize(authority, null, expected);
  if (result.ok) await reconcile(authority, null);
  return result.ok ? { ok: true, avatarPath: null } : { ok: false, message: result.message, avatarPath: result.avatarPath };
}
