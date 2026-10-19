import "server-only";

import { z } from "zod";

import { isAcademyRole, type AcademyRole } from "@/modules/academies/roles";
import { cookieAuthority, type Authority } from "./authority";

/** A verified caller with an active staff membership in one academy. */
export type AcademyMember = Authority & { role: AcademyRole };

/**
 * The caller's own active (unsuspended) staff membership in `academyId`, or null.
 *
 * Omitting `authority` resolves the request's cookie session (recovery sessions are refused); a
 * supplied bearer authority is used as is and never falls back to cookies, and an explicit `null`
 * denies. The query runs as the caller, so RLS applies, and nothing is cached across requests.
 * This is membership only: each domain keeps its own role checks, and the database re-checks.
 */
export async function academyMember(academyId: string, authority?: Authority | null): Promise<AcademyMember | null> {
  if (!z.uuid().safeParse(academyId).success) return null;
  const caller = authority === undefined ? await cookieAuthority() : authority;
  if (!caller) return null;
  const { data, error } = await caller.db.from("academy_memberships").select("role")
    .eq("academy_id", academyId).eq("user_id", caller.userId).is("suspended_at", null).maybeSingle();
  if (error || !data || !isAcademyRole(data.role)) return null;
  return { db: caller.db, userId: caller.userId, role: data.role };
}
