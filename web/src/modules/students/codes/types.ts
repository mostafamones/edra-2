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
  | "code_taken" | "invalid_format" | "code_exhausted" | "pattern_missing" | "idempotency_conflict";

/** Field keys: `defaultPattern` or `level:<levelId>`. */
export type StudentCodeFailure = {
  ok: false;
  code: StudentCodeErrorCode;
  message: string;
  fieldErrors?: Record<string, string>;
};

export type StudentCodeResult<T> = { ok: true; data: T } | StudentCodeFailure;

export const CODE_ACTIONS = ["assign", "replace", "replace_release", "generate", "retire"] as const;
export type StudentCodeAction = (typeof CODE_ACTIONS)[number];

export const RETIREMENT_REASONS = ["manual", "level_changed", "year_closed"] as const;

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
