import { z } from "zod";

import { createClient } from "@/lib/supabase/client";
import { loadActiveYear } from "@/modules/groups";

import { retiredStudentCodePageSchema, studentCodeSettingsSchema, studentCodeStateSchema, type RetiredStudentCodePage, type StudentCodeSettings, type StudentCodeState } from "./types";

// Keyed by account and academy so a late response never fills another academy's or account's view.
export const studentCodeQueryKeys = {
  /** Prefix of every students-table codes query; invalidate it after any code change. */
  listCodes: (academyId: string) => ["student-codes", academyId, "list-codes"] as const,
  levelStudents: (academyId: string) => ["student-codes", academyId, "level-students"] as const,
  retired: (academyId: string) => ["student-codes", academyId, "retired"] as const,
  state: (academyId: string, recordId: string) => ["student-codes", academyId, "state", recordId] as const,
  settings: (userId: string, academyId: string) => ["student-codes", userId, academyId, "settings"] as const,
};

/** Runs as the signed-in caller; the database rejects non-staff. */
export async function fetchStudentCodeSettings(academyId: string, signal?: AbortSignal): Promise<StudentCodeSettings> {
  let request = createClient().rpc("get_student_code_settings", { p_academy_id: academyId });
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw new Error(error.message);
  return studentCodeSettingsSchema.parse(data);
}

/** Active (unarchived) students per level in the open academic year; empty when no year is open. */
export async function fetchLevelStudentCounts(academyId: string, levelIds: string[]): Promise<Record<string, number>> {
  const year = await loadActiveYear(academyId);
  if (!year) return {};
  const db = createClient();
  const counts = await Promise.all(levelIds.map(async (levelId) => {
    const { count, error } = await db.from("annual_student_records").select("id", { count: "exact", head: true })
      .eq("academy_id", academyId).eq("academic_year_id", year.id).eq("level_id", levelId).is("archived_at", null);
    if (error) throw new Error(error.message);
    return [levelId, count ?? 0] as const;
  }));
  return Object.fromEntries(counts);
}

/** A record's current code and code-state version, read as the signed-in caller. */
export async function fetchStudentCodeState(academyId: string, recordId: string, signal?: AbortSignal): Promise<StudentCodeState> {
  let request = createClient().rpc("get_student_code_state", { p_academy_id: academyId, p_record_id: recordId });
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw new Error(error.message);
  return studentCodeStateSchema.parse(data);
}

export const RETIRED_PAGE_SIZE = 10;

/** One page of retired codes, newest first, optionally filtered by code or student name. */
export async function fetchRetiredStudentCodes(
  academyId: string, search: string, page: number, signal?: AbortSignal,
): Promise<RetiredStudentCodePage> {
  let request = createClient().rpc("list_retired_student_codes", {
    p_academy_id: academyId, p_search: search, p_limit: RETIRED_PAGE_SIZE, p_offset: page * RETIRED_PAGE_SIZE,
  });
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw new Error(error.message);
  return retiredStudentCodePageSchema.parse(data);
}

/** Current codes of the given records, keyed by record id; records without a code are absent. */
export async function fetchStudentCodes(academyId: string, recordIds: string[], signal?: AbortSignal): Promise<Record<string, string>> {
  let request = createClient().rpc("get_student_codes", { p_academy_id: academyId, p_record_ids: recordIds });
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw new Error(error.message);
  return z.record(z.string(), z.string()).parse(data);
}
