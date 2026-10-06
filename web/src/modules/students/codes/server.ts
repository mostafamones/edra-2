import "server-only";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

import { studentCodeSettingsSchema, studentCodeStateSchema, type StudentCodeSettings, type StudentCodeState } from "./types";

/**
 * Server-side read contracts for later code slices. Each runs as the signed-in caller, so the
 * database's membership checks and RLS decide; a forbidden or missing target returns null.
 */

/** Enabled flag, draft default formula, overrides, and configuration version (0 when never saved). */
export async function getStudentCodeSettings(academyId: string): Promise<StudentCodeSettings | null> {
  if (!z.uuid().safeParse(academyId).success) return null;
  const db = await createClient();
  const { data, error } = await db.rpc("get_student_code_settings", { p_academy_id: academyId });
  if (error) return null;
  return studentCodeSettingsSchema.parse(data);
}

/** A record's current code and code-state version (0 when it never held a code). */
export async function getStudentCodeState(academyId: string, recordId: string): Promise<StudentCodeState | null> {
  if (!z.uuid().safeParse(academyId).success || !z.uuid().safeParse(recordId).success) return null;
  const db = await createClient();
  const { data, error } = await db.rpc("get_student_code_state", { p_academy_id: academyId, p_record_id: recordId });
  if (error) return null;
  return studentCodeStateSchema.parse(data);
}

/** The level's override, otherwise the academy default; null when neither exists. Ignores enablement. */
export async function getEffectiveStudentCodePattern(academyId: string, levelId: string): Promise<string | null> {
  if (!z.uuid().safeParse(academyId).success || !levelId) return null;
  const db = await createClient();
  const { data, error } = await db.rpc("student_code_effective_pattern", { p_academy_id: academyId, p_level_id: levelId });
  if (error) throw new Error(error.message);
  return data ?? null;
}
