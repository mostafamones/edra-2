import type { StudentCodeErrorCode, StudentCodeFailure } from "./types";

const MESSAGES: Record<StudentCodeErrorCode, string> = {
  validation: "Check the highlighted fields and try again.",
  forbidden: "Only the academy owner or an admin can change student code settings.",
  invalid_level: "One of the levels is no longer offered by this academy. Reload and try again.",
  stale_settings: "Someone saved student code settings since you opened them. Reload to see the latest settings.",
  unavailable: "Something went wrong. Check your connection and try again.",
  codes_disabled: "Student codes are turned off for this academy.",
  not_found: "This student record no longer exists.",
  archived_record: "Archived students can’t receive codes. Restore the student first.",
  year_unavailable: "This student’s academic year is closed, so codes can’t be assigned.",
  code_exists: "This student already has a code. Retire it before assigning another.",
  stale_code: "This student’s code changed since you opened this. Reopen it to see the latest code.",
  code_taken: "This code is already used, or was used before, by a student in this academy.",
  invalid_format: "This code doesn’t match the format for this student’s level.",
  code_exhausted: "This format has no unused codes left. Change the format in student code settings.",
  pattern_missing: "No format is set for this student’s level. Set one in student code settings.",
  idempotency_conflict: "This request was already used for a different change. Try again.",
};

const CODES = new Set(Object.keys(MESSAGES));

export function failure(code: StudentCodeErrorCode, fieldErrors?: Record<string, string>): StudentCodeFailure {
  return { ok: false, code, message: MESSAGES[code], ...(fieldErrors ? { fieldErrors } : {}) };
}

/** Maps a P0001 error from the student code RPCs; validation hints name `default_pattern` or `level:<id>`. */
export function failureFromDatabase(error: { code?: string; message?: string; hint?: string | null }): StudentCodeFailure {
  const code = error.code === "P0001" && error.message && CODES.has(error.message)
    ? error.message as StudentCodeErrorCode
    : "unavailable";
  if (code === "validation" && error.hint === "code") return failure(code, { code: "Use 1–20 letters, digits, or hyphens." });
  if (code === "validation" && error.hint) {
    if (error.hint === "default_pattern") return failure(code, { defaultPattern: "Check this format." });
    if (error.hint.startsWith("level:")) return failure(code, { [error.hint]: "Check this format." });
  }
  return failure(code);
}
