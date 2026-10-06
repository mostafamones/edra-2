import { z } from "zod";

import { parseStudentCodePattern } from "./pattern";

export const MAX_LEVEL_PATTERNS = 50;

/**
 * Settings save input. Formulas are checked with the shared grammar so the form can point at the
 * failing field; the database repeats every check.
 */
export const studentCodeSettingsInputSchema = z.object({
  academyId: z.uuid(),
  expectedVersion: z.number().int().nonnegative(),
  enabled: z.boolean(),
  defaultPattern: z.string().max(100),
  levels: z.array(z.object({ levelId: z.string().min(1).max(50), pattern: z.string().max(100) })).max(MAX_LEVEL_PATTERNS),
}).superRefine((input, context) => {
  const blank = input.defaultPattern.trim() === "";
  if (!blank) {
    const parsed = parseStudentCodePattern(input.defaultPattern);
    if (!parsed.ok) context.addIssue({ code: "custom", path: ["defaultPattern"], message: parsed.message });
  }
  const seen = new Set<string>();
  for (const level of input.levels) {
    if (seen.has(level.levelId)) {
      context.addIssue({ code: "custom", path: [`level:${level.levelId}`], message: "This level already has a format." });
    }
    seen.add(level.levelId);
    const parsed = parseStudentCodePattern(level.pattern);
    if (!parsed.ok) context.addIssue({ code: "custom", path: [`level:${level.levelId}`], message: parsed.message });
  }
});

export type StudentCodeSettingsInput = z.infer<typeof studentCodeSettingsInputSchema>;

/** Field errors keyed `defaultPattern` or `level:<levelId>`, first message per field. */
export function settingsFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = typeof issue.path[0] === "string" ? issue.path[0] : "form";
    fields[key] ??= issue.message;
  }
  return fields;
}
