import "@tanstack/react-start/server-only";
import { createClient as createServiceClient } from "@supabase/supabase-js";

import { publicEnv } from "@/lib/env/public";
import type { Database } from "@/lib/supabase/database.types";


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

  return result;
}

/** Rereads persisted state, e.g. after an uncertain save or to review a conflicting change. */
export async function loadAcademyProfile(academySlug: string): Promise<AcademyProfile | null> {
  if (typeof academySlug !== "string") return null;
  return getAcademyProfile(academySlug);
}

export type DeleteAcademyResult = { ok: true } | { ok: false; code: "sessionExpired" | "forbidden" | "nameMismatch" | "deleteFailed" };

/**
 * Permanently deletes the academy and everything it owns. The database requires the caller to be its active
 * Owner and `confirmName` to equal the current name exactly; the slug is only a selector.
 */
export async function deleteAcademy(academySlug: string, confirmName: string): Promise<DeleteAcademyResult> {
  if (typeof academySlug !== "string" || typeof confirmName !== "string") return { ok: false, code: "deleteFailed" };
  try {
    const db = await createClient();
    const { data: auth } = await db.auth.getClaims();
    if (!auth?.claims) return { ok: false, code: "sessionExpired" };
    const academy = await resolveStaffAcademy(academySlug);
    if (!academy || academy.role !== "owner") return { ok: false, code: "forbidden" };
    // Without the storage key the uploads could not be removed afterwards, so nothing is deleted.
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) {
      console.error("Academy delete refused: SUPABASE_SERVICE_ROLE_KEY is not configured");
      return { ok: false, code: "deleteFailed" };
    }
    const { data, error } = await db.rpc("delete_academy", { p_academy_id: academy.id, p_confirm_name: confirmName });
    if (!error) {
      await removeAcademyFiles(createServiceClient<Database>(publicEnv.supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } }), academy.id, data ?? []);
      return { ok: true };
    }
    if (error.message.includes("academy_name_mismatch")) return { ok: false, code: "nameMismatch" };
    if (error.message.includes("forbidden")) return { ok: false, code: "forbidden" };
    console.error("Academy delete failed", { code: error.code, message: error.message });
    return { ok: false, code: "deleteFailed" };
  } catch (error) {
    console.error("Academy delete failed", error);
    return { ok: false, code: "deleteFailed" };
  }
}

/**
 * Removes the deleted academy's uploads after the database delete committed. Each batch is tried three times;
 * whatever still fails is logged with its paths, since the database rows that listed them are already gone.
 */
async function removeAcademyFiles(storage: ReturnType<typeof createServiceClient<Database>>, academyId: string, files: { bucket_id: string; name: string }[]) {
  for (const bucket of new Set(files.map((file) => file.bucket_id))) {
    const paths = files.filter((file) => file.bucket_id === bucket).map((file) => file.name);
    for (let start = 0; start < paths.length; start += 1000) {
      const batch = paths.slice(start, start + 1000);
      let failure: unknown = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const result = await storage.storage.from(bucket).remove(batch).catch((error: unknown) => ({ error }));
        failure = result.error;
        if (!failure) break;
      }
      if (failure) console.error("Deleted academy files were not removed", { academyId, bucket, paths: batch, failure });
    }
  }
}
