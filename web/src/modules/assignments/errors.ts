import type { AssignmentErrorCode, AssignmentFailure } from "./types";

const MESSAGES: Record<AssignmentErrorCode, string> = {
  stale_basis: "The scoring basis changed. Review the latest key and exclusions before correcting it.",
  question_excluded: "This question is excluded and cannot be changed or marked.",
  not_qualified: "This student has no qualifying work for answer videos.",
  online_draft: "This student is working on this assignment online. Their work can be marked after they submit it.",
  source_locked: "This student submitted online. Their choice answers are their own; only Written Work can be marked here.",
  validation: "Some details aren’t valid. Check the fields and try again.",
  forbidden: "You don’t have permission to do this in this academy.",
  not_found: "This assignment no longer exists in this academy.",
  year_unavailable: "This academic year is closed, so its assignments are read-only.",
  assignment_conflict: "Someone else changed this assignment first. Review the latest version and try again.",
  invalid_audience: "The audience is no longer valid. Choose an active level, track, or groups in this academic year.",
  invalid_state: "This action isn’t available in the assignment’s current state. Refresh and try again.",
  structure_locked: "The audience, parts, and questions are locked once marking starts. Only titles, instructions, and the due date can change.",
  incomplete: "Some parts aren’t finished. Give every part a type and complete its questions, choices, and correct answers before marking.",
  has_activity: "Students already have work on this assignment, so its students can’t change.",
  not_recipient: "This student isn’t a recipient of this assignment.",
  invalid_score: "Enter a mark from 0 up to the part’s maximum, with at most two decimals.",
  unknown_part: "That part no longer belongs to this assignment. Refresh and try again.",
  assignment_closed: "This assignment is closed, so no newly received work can be recorded.",
  has_marks: "This student already has marks. Clear them before recording the work as missing or excused.",
  student_codes_disabled: "Student codes are turned off for this academy.",
  student_code_not_found: "No student has this code.",
  student_code_retired: "This code was retired and no longer identifies a student.",
  student_code_ambiguous: "More than one student has used this code. Choose the student from the list instead.",
  student_changed: "This code now identifies a different student than the one shown. Nothing was saved. Look the code up again.",
  idempotency_conflict: "This request was already used for a different change. Try again.",
  throttled: "Too many changes in a short time. Wait a moment and try again.",
  unavailable: "Could not reach the server. Check your connection and try again.",
};

const CODES = new Set(Object.keys(MESSAGES));

export function failure(code: AssignmentErrorCode, retryAfter?: number): AssignmentFailure {
  return { ok: false, code, message: MESSAGES[code], ...(retryAfter ? { retryAfter } : {}) };
}

/** The assignment RPCs raise SQLSTATE P0001 with the code as the message; anything else is unavailable. */
export function failureFromDatabase(error: { code?: string; message?: string; details?: string }): AssignmentFailure {
  if (error.code !== "P0001" || !error.message || !CODES.has(error.message)) return failure("unavailable");
  if (error.message === "throttled") {
    const seconds = Number.parseInt(error.details ?? "", 10);
    return failure("throttled", Number.isFinite(seconds) && seconds > 0 ? seconds : 60);
  }
  return failure(error.message as AssignmentErrorCode);
}
