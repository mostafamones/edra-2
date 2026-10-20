import type { StudentExamErrorCode, StudentExamFailure } from "./types";

/** Student-facing messages; staff errors keep their own wording in ../errors.ts. */
const MESSAGES: Record<StudentExamErrorCode, string> = {
  validation: "This exam link isn’t valid.",
  forbidden: "Sign in again to continue.",
  not_found: "This exam isn’t available.",
  student_link_unavailable: "Your exams in this academy aren’t available right now.",
  content_unavailable: "This exam isn’t available.",
  year_unavailable: "This academic year has closed.",
  not_open: "This exam isn’t open for new attempts.",
  not_eligible: "This exam isn’t assigned to you.",
  source_conflict: "Your work for this exam was already received.",
  unknown_question: "This question is no longer part of the exam.",
  question_excluded: "This question was removed from the exam.",
  idempotency_conflict: "Your answers couldn’t be saved. Reload the exam to continue.",
  throttled: "Too many requests in a short time. Wait a moment and try again.",
  unavailable: "Could not reach the server. Check your connection and try again.",
};

const CODES = new Set(Object.keys(MESSAGES));

export function studentFailure(code: StudentExamErrorCode, retryAfter?: number): StudentExamFailure {
  return { ok: false, code, message: MESSAGES[code], ...(retryAfter ? { retryAfter } : {}) };
}

/** Student exam RPCs raise SQLSTATE P0001 with a stable code; anything else is unavailable. */
export function studentFailureFromDatabase(error: { code?: string; message?: string; details?: string }): StudentExamFailure {
  if (error.code !== "P0001" || !error.message || !CODES.has(error.message)) return studentFailure("unavailable");
  if (error.message === "throttled") {
    const seconds = Number.parseInt(error.details ?? "", 10);
    return studentFailure("throttled", Number.isFinite(seconds) && seconds > 0 ? seconds : 60);
  }
  return studentFailure(error.message as StudentExamErrorCode);
}
