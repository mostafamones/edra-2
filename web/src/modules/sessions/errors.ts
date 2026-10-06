import type { SessionErrorCode, SessionFailure } from "./types";

const MESSAGES: Record<SessionErrorCode, string> = {
  validation: "This request is not valid. Reload and try again.",
  forbidden: "You do not have permission to do this in this academy.",
  not_found: "This schedule or session no longer exists.",
  schedule_unavailable: "This schedule is archived and can no longer start sessions.",
  year_unavailable: "Sessions can only start in the active academic year.",
  idempotency_conflict: "This start request was already used for another schedule. Try again.",
  session_ended: "This session has already ended.",
  session_live: "End this session before deleting it.",
  session_published: "This session’s attendance was published. You could force delete the session, but attendance will be permanently deleted too.",
  unavailable: "Could not reach the server. Check your connection and try again.",
};

const CODES = new Set(Object.keys(MESSAGES));

export function failure(code: SessionErrorCode): SessionFailure {
  return { ok: false, code, message: MESSAGES[code] };
}

/** The session RPCs raise SQLSTATE P0001 with the code as the message; anything else is unavailable. */
export function failureFromDatabase(error: { code?: string; message?: string }): SessionFailure {
  return failure(error.code === "P0001" && error.message && CODES.has(error.message)
    ? error.message as SessionErrorCode
    : "unavailable");
}
