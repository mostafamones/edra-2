import type { AttendanceErrorCode, AttendanceFailure } from "./types";

const MESSAGES: Record<AttendanceErrorCode, string> = {
  validation: "This request is not valid. Reload and try again.",
  forbidden: "You do not have permission to take attendance in this academy.",
  not_found: "This session no longer exists in this academy.",
  student_not_found: "This student isn’t in this session’s academy and year.",
  not_on_roster: "This student isn’t on the session roster.",
  student_codes_disabled: "Student codes are turned off for this academy. Check the student in by name.",
  student_code_retired: "This code is no longer active. Check the student in by name or use their current code.",
  student_code_not_found: "No student in this academy has this code.",
  student_code_ambiguous: "This code was issued to more than one student. Check the student in by name; staff must issue a new code.",
  session_ended: "This session has ended. Check-ins only work while it is live.",
  session_archived: "This session is archived, so its attendance is read-only. A manager can restore it.",
  year_unavailable: "This academic year is closed, so attendance is read-only.",
  publication_stale: "Attendance changed after you reviewed it. Review the latest values and finalize again.",
  idempotency_conflict: "This request was already used for a different change. Try again.",
  throttled: "Too many attendance changes in a short time. Wait a moment and try again.",
  unavailable: "Could not reach the server. Check your connection and try again.",
};

const CODES = new Set(Object.keys(MESSAGES));

export function failure(code: AttendanceErrorCode, retryAfter?: number): AttendanceFailure {
  return { ok: false, code, message: MESSAGES[code], ...(retryAfter ? { retryAfter } : {}) };
}

/**
 * The attendance RPCs raise SQLSTATE P0001 with the code as the message; anything else is unavailable.
 * `throttled` carries the seconds until the quota window resets in its detail.
 */
export function failureFromDatabase(error: { code?: string; message?: string; details?: string }): AttendanceFailure {
  if (error.code !== "P0001" || !error.message || !CODES.has(error.message)) return failure("unavailable");
  if (error.message === "throttled") {
    const seconds = Number.parseInt(error.details ?? "", 10);
    return failure("throttled", Number.isFinite(seconds) && seconds > 0 ? seconds : 60);
  }
  return failure(error.message as AttendanceErrorCode);
}
