import { z } from "zod";

/** One level's formula override. */
export type LevelPattern = { levelId: string; pattern: string };

/** An academy's student code configuration. A version of 0 means it was never saved (disabled). */
export type StudentCodeSettings = {
  enabled: boolean;
  defaultPattern: string | null;
  version: number;
  levels: LevelPattern[];
};

/** A record's current code (null when uncoded) and monotonic code-state version (0 if never coded). */
export type StudentCodeState = { code: string | null; version: number };

export const studentCodeSettingsSchema = z.object({
  enabled: z.boolean(),
  defaultPattern: z.string().nullable(),
  version: z.number().int().nonnegative(),
  levels: z.array(z.object({ levelId: z.string(), pattern: z.string() })),
});

export const studentCodeStateSchema = z.object({
  code: z.string().nullable(),
  version: z.number().int().nonnegative(),
});

export type StudentCodeErrorCode =
  | "validation" | "forbidden" | "invalid_level" | "stale_settings" | "unavailable"
  | "codes_disabled" | "not_found" | "archived_record" | "year_unavailable" | "code_exists" | "stale_code"
  | "code_taken" | "code_release_removed" | "invalid_format" | "code_exhausted" | "pattern_missing" | "idempotency_conflict"
  | "invalid_target" | "stale_preview";

/** Field keys: `defaultPattern` or `level:<levelId>`. */
export type StudentCodeFailure = {
  ok: false;
  code: StudentCodeErrorCode;
  message: string;
  fieldErrors?: Record<string, string>;
};

export type StudentCodeResult<T> = { ok: true; data: T } | StudentCodeFailure;

export const CODE_ACTIONS = ["assign", "replace", "generate", "retire"] as const;
export type StudentCodeAction = (typeof CODE_ACTIONS)[number];

export const RETIREMENT_REASONS = ["manual", "level_changed", "year_closed", "released"] as const;

/** One retired code with the student who held it. */
export const retiredStudentCodeSchema = z.object({
  id: z.string(),
  code: z.string(),
  studentName: z.string(),
  levelId: z.string(),
  reason: z.enum(RETIREMENT_REASONS),
  retiredAt: z.string(),
});

export const retiredStudentCodePageSchema = z.object({
  total: z.number().int().nonnegative(),
  rows: z.array(retiredStudentCodeSchema),
});

export type RetiredStudentCode = z.infer<typeof retiredStudentCodeSchema>;
export type RetiredStudentCodePage = z.infer<typeof retiredStudentCodePageSchema>;

/** Which students a generation run targets: everyone, chosen levels, or chosen groups (open year, active only). */
export const GENERATION_MODES = ["all", "levels", "groups"] as const;
export type GenerationMode = (typeof GENERATION_MODES)[number];

/** How numbers are picked: where to start (null continues after the format's counter), the gap between codes, and odd/even only. */
export const GENERATION_PARITIES = ["any", "even", "odd"] as const;
export const generationOptionsSchema = z.object({
  start: z.number().int().min(1).max(99999999).nullable(),
  step: z.number().int().min(1).max(1000),
  parity: z.enum(GENERATION_PARITIES),
});
export type GenerationOptions = z.infer<typeof generationOptionsSchema>;
export const DEFAULT_GENERATION_OPTIONS: GenerationOptions = { start: null, step: 1, parity: "any" };

/** One format a generation run would use. Examples are the next free values now, not a promise. */
export const generationPatternSchema = z.object({
  pattern: z.string(),
  levelIds: z.array(z.string()),
  missing: z.number().int().nonnegative(),
  available: z.number().int(),
  examples: z.array(z.string()),
});

/** What a run would do; `token` identifies this exact summary so a stale review is rejected. */
export const generationPreviewSchema = z.object({
  settingsVersion: z.number().int().positive(),
  options: generationOptionsSchema,
  token: z.string(),
  targets: z.number().int().nonnegative(),
  coded: z.number().int().nonnegative(),
  missing: z.number().int().nonnegative(),
  patterns: z.array(generationPatternSchema),
  missingFormat: z.array(z.object({ levelId: z.string(), missing: z.number().int().positive() })),
});

/** A completed run. Codes were issued in name order (`order: "name"`). */
export const generationResultSchema = z.object({
  targets: z.number().int().nonnegative(),
  assigned: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  mode: z.enum(GENERATION_MODES),
  ids: z.array(z.string()),
  settingsVersion: z.number().int().positive(),
  options: generationOptionsSchema,
  order: z.literal("name"),
});

export type GenerationPattern = z.infer<typeof generationPatternSchema>;
export type GenerationPreview = z.infer<typeof generationPreviewSchema>;
export type GenerationResult = z.infer<typeof generationResultSchema>;
