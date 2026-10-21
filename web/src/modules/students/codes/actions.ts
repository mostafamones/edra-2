"use server";

import { z } from "zod";

import type { Database } from "@/lib/supabase/database.types";

import { staffContext } from "../records/data";
import { failure, failureFromDatabase } from "./errors";
import { canConfigureStudentCodes } from "./permissions";
import {
  CODE_ACTIONS, GENERATION_MODES, generationOptionsSchema, generationPreviewSchema, generationResultSchema, studentCodeStateSchema,
  type GenerationPreview, type GenerationResult, type StudentCodeResult, type StudentCodeState,
} from "./types";
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
  academyId: z.guid(),
  recordId: z.guid(),
  action: z.enum(CODE_ACTIONS),
  code: z.string().max(100).optional(),
  expectedVersion: z.number().int().nonnegative(),
  requestKey: z.guid(),
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
      p_code: (input.action === "assign" || input.action === "replace" ? input.code ?? "" : null) as string,
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
  const ids = z.object({ academyId: z.guid(), recordId: z.guid() }).safeParse({ academyId, recordId });
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

const scopeSchema = z.object({
  academyId: z.guid(),
  mode: z.enum(GENERATION_MODES),
  ids: z.array(z.string().min(1).max(100)).max(100),
  options: generationOptionsSchema,
});

/**
 * What generating missing codes for a scope would do: counts, formats, capacity, and advisory
 * examples. Reserves nothing. Every staff role may preview while codes are on.
 */
export async function previewStudentCodeGeneration(value: unknown): Promise<StudentCodeResult<GenerationPreview>> {
  const parsed = scopeSchema.safeParse(value);
  if (!parsed.success) return failure("validation");
  const input = parsed.data;
  const actor = await staffContext(input.academyId);
  if (!actor) return failure("forbidden");
  try {
    const { data, error } = await actor.db.rpc("preview_student_code_generation", {
      p_academy_id: input.academyId, p_mode: input.mode, p_ids: input.ids,
      // SQL null continues after the format's counter; the generated type only models optional arguments.
      p_start: input.options.start as number, p_step: input.options.step, p_parity: input.options.parity,
    });
    if (error) return failureFromDatabase(error);
    const preview = generationPreviewSchema.safeParse(data);
    return preview.success ? { ok: true, data: preview.data } : failure("unavailable");
  } catch {
    return failure("unavailable");
  }
}

const generateSchema = scopeSchema.extend({
  expectedVersion: z.number().int().positive(),
  previewToken: z.string().regex(/^[0-9a-f]{32}$/),
  requestKey: z.guid(),
});

/**
 * Issues every missing code in the reviewed scope in one transaction, or none. Returns
 * `stale_preview` when the reviewed summary no longer holds. The browser keeps `requestKey` for a
 * retry after an unknown outcome, which replays the original counts.
 */
export async function generateStudentCodes(value: unknown): Promise<StudentCodeResult<GenerationResult>> {
  const parsed = generateSchema.safeParse(value);
  if (!parsed.success) return failure("validation");
  const input = parsed.data;
  const actor = await staffContext(input.academyId);
  if (!actor) return failure("forbidden");
  try {
    const { data, error } = await actor.db.rpc("generate_student_codes", {
      p_academy_id: input.academyId,
      p_mode: input.mode,
      p_ids: input.ids,
      p_expected_version: input.expectedVersion,
      p_preview_token: input.previewToken,
      p_request_key: input.requestKey,
      p_start: input.options.start as number,
      p_step: input.options.step,
      p_parity: input.options.parity,
    });
    if (error) return failureFromDatabase(error);
    const result = generationResultSchema.safeParse(data);
    return result.success ? { ok: true, data: result.data } : failure("unavailable");
  } catch {
    return failure("unavailable");
  }
}
