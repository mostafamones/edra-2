"use server";

import { z } from "zod";

import type { Database } from "@/lib/supabase/database.types";

import { staffContext } from "../records/data";
import { failure, failureFromDatabase } from "./errors";
import { canConfigureStudentCodes } from "./permissions";
import { CODE_ACTIONS, studentCodeStateSchema, type StudentCodeResult, type StudentCodeState } from "./types";
import { settingsFieldErrors, studentCodeSettingsInputSchema } from "./validation";

type SaveArgs = Database["public"]["Functions"]["save_student_code_settings"]["Args"];

/**
 * Saves the academy's student code configuration when `expectedVersion` is still current. Never
 * issues codes. Disabling keeps formulas, assignments, counters, and history.
 */
export async function saveStudentCodeSettings(value: unknown): Promise<StudentCodeResult<{ version: number }>> {
  const parsed = studentCodeSettingsInputSchema.safeParse(value);
  if (!parsed.success) return failure("validation", settingsFieldErrors(parsed.error));
  const input = parsed.data;
  const actor = await staffContext(input.academyId);
  if (!actor || !canConfigureStudentCodes(actor.role)) return failure("forbidden");
  try {
    const { data, error } = await actor.db.rpc("save_student_code_settings", {
      p_academy_id: input.academyId,
      p_expected_version: input.expectedVersion,
      p_enabled: input.enabled,
      // SQL null clears the draft; the generator types every argument as non-null.
      p_default_pattern: (input.defaultPattern.trim() || null) as SaveArgs["p_default_pattern"],
      p_levels: input.levels.filter((level) => level.pattern.trim() !== ""),
    });
    if (error) return failureFromDatabase(error);
    const version = (data as { version?: unknown } | null)?.version;
    if (typeof version !== "number") return failure("unavailable");
    return { ok: true, data: { version } };
  } catch {
    return failure("unavailable");
  }
}

const changeInputSchema = z.object({
  academyId: z.uuid(),
  recordId: z.uuid(),
  action: z.enum(CODE_ACTIONS),
  code: z.string().max(100).optional(),
  expectedVersion: z.number().int().nonnegative(),
  requestKey: z.uuid(),
});

/**
 * Assigns a manual code, replaces the current one in a single step, generates one from the level's format, or explicitly retires the current
 * code. Each call is one committed change; the browser keeps `requestKey` across retries so a
 * repeated submit replays instead of changing twice. Returns the record's resulting code state.
 */
export async function changeStudentCode(value: unknown): Promise<StudentCodeResult<StudentCodeState>> {
  const parsed = changeInputSchema.safeParse(value);
  if (!parsed.success) return failure("validation");
  const input = parsed.data;
  const actor = await staffContext(input.academyId);
  if (!actor) return failure("forbidden");
  try {
    const { data, error } = await actor.db.rpc("change_student_code", {
      p_academy_id: input.academyId,
      p_record_id: input.recordId,
      p_action: input.action,
      p_code: (input.action === "assign" || input.action === "replace" || input.action === "replace_release" ? input.code ?? "" : null) as string,
      p_expected_version: input.expectedVersion,
      p_request_key: input.requestKey,
    });
    if (error) return failureFromDatabase(error);
    const state = studentCodeStateSchema.safeParse(data);
    if (!state.success) return failure("unavailable");
    return { ok: true, data: state.data };
  } catch {
    return failure("unavailable");
  }
}

/**
 * The next unused code for the student's format, to show in the code field. Reserves nothing and
 * moves no cursor; assigning it still goes through `changeStudentCode` and can fail if it was taken.
 */
export async function peekNextStudentCode(academyId: unknown, recordId: unknown): Promise<StudentCodeResult<{ code: string }>> {
  const ids = z.object({ academyId: z.uuid(), recordId: z.uuid() }).safeParse({ academyId, recordId });
  if (!ids.success) return failure("validation");
  const actor = await staffContext(ids.data.academyId);
  if (!actor) return failure("forbidden");
  try {
    const { data, error } = await actor.db.rpc("peek_next_student_code", {
      p_academy_id: ids.data.academyId, p_record_id: ids.data.recordId,
    });
    if (error) return failureFromDatabase(error);
    if (typeof data !== "string") return failure("unavailable");
    return { ok: true, data: { code: data } };
  } catch {
    return failure("unavailable");
  }
}

/** Owner/Admin: stops reserving a retired code so it can be issued again, to any student. */
export async function unretireStudentCode(academyId: unknown, assignmentId: unknown): Promise<StudentCodeResult<{ id: string }>> {
  const ids = z.object({ academyId: z.uuid(), assignmentId: z.uuid() }).safeParse({ academyId, assignmentId });
  if (!ids.success) return failure("validation");
  const actor = await staffContext(ids.data.academyId);
  if (!actor || !canConfigureStudentCodes(actor.role)) return failure("forbidden");
  try {
    const { data, error } = await actor.db.rpc("unretire_student_code", {
      p_academy_id: ids.data.academyId, p_assignment_id: ids.data.assignmentId,
    });
    if (error) return failureFromDatabase(error);
    const id = (data as { id?: unknown } | null)?.id;
    return typeof id === "string" ? { ok: true, data: { id } } : failure("unavailable");
  } catch {
    return failure("unavailable");
  }
}
