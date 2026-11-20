import "@tanstack/react-start/server-only";

import type { Authority } from "@/lib/supabase/authority";

import { accountName } from "./validation";

/** Same lifetime as the web avatar URL; clients re-read the profile to refresh it. */
export const AVATAR_URL_SECONDS = 60 * 60;

export type OwnProfile = { userId: string; name: string | null; avatarUrl: string | null; avatarExpiresAt: string | null };

/**
 * The verified caller's own display profile, read as that caller (RLS and the owner-only avatar
 * policy stay active). The identity comes only from the authority, never from request input. A
 * failed avatar signing keeps the name and reports no picture; the storage path is never returned.
 */
export async function readOwnProfile(authority: Authority, now = Date.now()): Promise<OwnProfile> {
  const { db, userId } = authority;
  const { data, error } = await db.from("profiles").select("full_name, display_name, avatar_path").eq("id", userId).maybeSingle();
  if (error) throw error;
  const profile: OwnProfile = { userId, name: accountName(data), avatarUrl: null, avatarExpiresAt: null };
  if (!data?.avatar_path) return profile;
  const signed = await db.storage.from("avatars").createSignedUrl(data.avatar_path, AVATAR_URL_SECONDS).catch(() => null);
  if (!signed?.data?.signedUrl || signed.error) return profile;
  return { ...profile, avatarUrl: signed.data.signedUrl, avatarExpiresAt: new Date(now + AVATAR_URL_SECONDS * 1000).toISOString() };
}
