import { ERROR_CODES, type StudentAssignmentErrorCode, type StudentAssignmentFailure } from "./types";

/** Student-facing messages; staff errors keep their own wording in ../errors.ts. */
const MESSAGES: Record<StudentAssignmentErrorCode, string> = {
  validation: "This change couldn’t be saved. Reload the assignment and try again.",
  forbidden: "Sign in again to continue.",
  not_found: "This assignment isn’t available.",
  student_unavailable: "Your assignments in this academy aren’t available right now.",
  editor_stale: "This assignment is open on another device or tab.",
  draft_conflict: "Your work changed elsewhere. Reload to see the latest saved work.",
  idempotency_conflict: "Your work couldn’t be saved. Reload the assignment to continue.",
  question_excluded: "A question was removed from this assignment. Reload to continue.",
  file_limit: "Each Written Work part accepts up to 20 files.",
  file_unavailable: "This file couldn’t be uploaded. Remove it and try again.",
  files_required: "Upload at least one file for every Written Work part.",
  uploads_pending: "Wait for uploads to finish, or remove failed uploads.",
  unsupported_file: "This file isn’t a supported PDF, JPEG, PNG or WebP file.",
  throttled: "Too many requests in a short time. Wait a moment and try again.",
  unavailable: "Could not reach the server. Check your connection and try again.",
  submitted: "You already submitted this assignment.",
  result_announced: "Your result for this assignment has been announced.",
  assignment_closed: "Submissions for this assignment are closed.",
  online_unavailable: "This assignment can’t be completed online.",
  not_recipient: "This assignment isn’t assigned to you.",
  in_person_disabled: "Online submission isn’t enabled for in-person students.",
  entitlement_required: "You need access to this unit to work on its assignment.",
};

const CODES = new Set<string>(ERROR_CODES);

export function studentAssignmentFailure(code: StudentAssignmentErrorCode): StudentAssignmentFailure {
  return { ok: false, code, message: MESSAGES[code] };
}

/** Student assignment RPCs raise P0001 with a stable code; anything else is unavailable. */
export function studentAssignmentFailureFromDatabase(error: { code?: string; message?: string }): StudentAssignmentFailure {
  if (error.code !== "P0001" || !error.message || !CODES.has(error.message)) return studentAssignmentFailure("unavailable");
  return studentAssignmentFailure(error.message as StudentAssignmentErrorCode);
}

export function blockedMessage(code: StudentAssignmentErrorCode) {
  return MESSAGES[code];
}
