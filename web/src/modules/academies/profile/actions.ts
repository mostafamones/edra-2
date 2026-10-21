"use server";

import { refresh } from "next/cache";

import { createClient } from "../../../lib/supabase/server";
import { isAcademyProfileEditor } from "../roles";
import { resolveStaffAcademy } from "../server";
import { getAcademyProfile, PROFILE_COLUMNS, toAcademyProfile } from "./server";
import { academyProfileSchema, sameProfileValues, type AcademyProfile, type AcademyProfileFields } from "./validation";

export type AcademyProfileResult =
  | { ok: true; profile: AcademyProfile }
  | { ok: false; code: "invalid"; fieldErrors: Partial<Record<keyof AcademyProfileFields, string>> }
  | { ok: false; code: "sessionExpired" | "forbidden" | "saveFailed" }
  /** Someone else saved first; `current` is the newer persisted profile. */
  | { ok: false; code: "conflict"; current: AcademyProfile };

/**
 * Saves all five profile fields in one UPDATE, only if the academy is unchanged since `expectedUpdatedAt`.
 * The slug is only a selector: membership and role are resolved again from the session, and RLS decides.
 */
export async function saveAcademyProfile(academySlug: string, expectedUpdatedAt: string, input: unknown): Promise<AcademyProfileResult> {
  const parsed = academyProfileSchema.safeParse(input);
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors;
    return { ok: false, code: "invalid", fieldErrors: Object.fromEntries(Object.entries(fields).map(([key, messages]) => [key, messages?.[0]])) };
  }
  if (typeof academySlug !== "string" || typeof expectedUpdatedAt !== "string" || !expectedUpdatedAt) return { ok: false, code: "saveFailed" };

  let result: AcademyProfileResult;
  try {
    const db = await createClient();
    const { data: auth } = await db.auth.getClaims();
    if (!auth?.claims) return { ok: false, code: "sessionExpired" };
    const academy = await resolveStaffAcademy(academySlug);
    // A stale client role grants nothing; RLS enforces the same rule below.
    if (!academy || !isAcademyProfileEditor(academy.role)) return { ok: false, code: "forbidden" };

    const { data, error } = await db.from("academies").update(parsed.data)
      .eq("id", academy.id).eq("updated_at", expectedUpdatedAt)
      .select(PROFILE_COLUMNS).maybeSingle();
    if (data) {
      result = { ok: true, profile: toAcademyProfile(data, academy.role) };
    } else {
      // No row came back: reread before deciding, so a lost response or a repeat of the same values is not a failure.
      const reread = await db.from("academies").select(PROFILE_COLUMNS).eq("id", academy.id).maybeSingle();
      if (reread.error) return { ok: false, code: "saveFailed" };
      if (!reread.data) return { ok: false, code: "forbidden" };
      const current = toAcademyProfile(reread.data, academy.role);
      if (sameProfileValues(current, parsed.data)) result = { ok: true, profile: current };
      else if (error) return { ok: false, code: "saveFailed" };
      else if (current.updatedAt !== expectedUpdatedAt) return { ok: false, code: "conflict", current };
      else return { ok: false, code: "forbidden" };
    }
  } catch (error) {
    console.error("Academy profile save failed", error);
    return { ok: false, code: "saveFailed" };
  }

  // The save is committed; a failed shell refresh must not turn it into an error.
  try {
    refresh();
  } catch (error) {
    console.error("Academy profile refresh failed", error);
  }
  return result;
}

/** Rereads persisted state, e.g. after an uncertain save or to review a conflicting change. */
export async function loadAcademyProfile(academySlug: string): Promise<AcademyProfile | null> {
  if (typeof academySlug !== "string") return null;
  return getAcademyProfile(academySlug);
}
