import type { StudentRecordErrorCode, StudentRecordFailure, StudentRecordField } from "./types";

const MESSAGES: Record<StudentRecordErrorCode, string> = {
  validation: "Check the highlighted fields and try again.",
  forbidden: "You do not have permission to make this change.",
  duplicate_student_phone: "Another student this year already uses this student phone number.",
  invalid_placement: "Choose an active group that matches the student’s level and track.",
  stale_record: "Someone else saved this student since you opened it.",
  archived_record: "Archived student records can’t be edited. Restore it first.",
  year_unavailable: "The academic year this form was opened for is no longer active. Reload and try again.",
  not_found: "This student record no longer exists.",
  unavailable: "Could not save the student. Check your connection and try again.",
  incompatible_selection: "Every selected student must share the destination group’s level and track.",
  import_state: "This import has moved on since this page loaded. Reload to see where it stands.",
  stale_revision: "This preview changed in another tab or window. Reload it and try again.",
  stage_conflict: "This file’s rows differ from the ones already sent. Start a new import with the file.",
  incomplete_staging: "Not every row of the file has been sent yet. Select the same file again to finish.",
  outcome_changed: "Student records or the academy’s levels, tracks, or groups changed. Review the refreshed preview and confirm again.",
};

const CODES = new Set(Object.keys(MESSAGES));

/** Field hints raised by check_student_record_input. */
const VALIDATION_FIELDS: Record<string, StudentRecordField> = {
  full_name: "fullName",
  student_phone: "studentPhone",
  parent_phone: "parentPhone",
  placement: "levelId",
};

export function failure(code: StudentRecordErrorCode, fieldErrors?: StudentRecordFailure["fieldErrors"]): StudentRecordFailure {
  return { ok: false, code, message: MESSAGES[code], ...(fieldErrors ? { fieldErrors } : {}) };
}

/**
 * Maps a database error from the student RPCs to a stable failure. The RPCs raise SQLSTATE P0001
 * with the code as the message; anything else is reported as unavailable.
 */
export function failureFromDatabase(error: { code?: string; message?: string; hint?: string | null }): StudentRecordFailure {
  const code = error.code === "P0001" && error.message && CODES.has(error.message)
    ? error.message as StudentRecordErrorCode
    : "unavailable";
  if (code === "duplicate_student_phone") return failure(code, { studentPhone: MESSAGES.duplicate_student_phone });
  if (code === "validation" && error.hint && VALIDATION_FIELDS[error.hint]) {
    return failure(code, { [VALIDATION_FIELDS[error.hint]]: "Check this value." });
  }
  if (code === "invalid_placement") return failure(code, { primaryGroupId: MESSAGES.invalid_placement });
  return failure(code);
}
