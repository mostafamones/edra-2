import type { ExamErrorCode, ExamFailure } from "./types";

const MESSAGES: Record<ExamErrorCode, string> = {
  validation: "Some details aren’t valid. Check the fields and try again.",
  forbidden: "You don’t have permission to do this in this academy.",
  not_found: "This exam no longer exists in this academy.",
  year_unavailable: "This academic year is closed, so its exams are read-only.",
  exam_conflict: "Someone else changed this exam first. Review the latest version and try again.",
  invalid_audience: "The audience is no longer valid. Choose an active level, track or groups in this academic year.",
  target_locked: "Students have started work, so the audience and timer can’t change.",
  structure_locked: "Answers or marks exist, so parts, questions, choices and marks can’t change. Use a key correction or exclusion instead.",
  not_ready: "Finish the audience, the timer and every part’s questions, choices and correct answers first.",
  exam_closed: "This exam’s window has closed. Accepted work can still be marked and announced.",
  already_open: "The exam has already opened, so its opening time can’t change.",
  window_locked: "Students have started, so the closing time can only move later.",
  invalid_state: "This action isn’t available for the exam right now. Refresh and try again.",
  not_eligible: "This student isn’t in the exam’s audience.",
  not_open: "The exam isn’t open for new attempts.",
  attempt_finalized: "This attempt has already been submitted.",
  source_conflict: "This student’s work was already accepted from another source. The earlier work stays as history.",
  not_submitted: "This student has no accepted work to mark yet.",
  incomplete: "Some written questions aren’t marked yet.",
  invalid_score: "Enter a mark from 0 up to the question’s maximum, with at most two decimals.",
  question_excluded: "That question is excluded. Its saved answers and marks are kept but can’t change.",
  unknown_question: "That question or choice no longer belongs to this exam. Refresh and try again.",
  stale_basis: "The answer key or exclusions changed. Refresh to review the recalculated results, then try again.",
  invalid_exclusion: "At least one question must keep counting toward the score.",
  exam_work_pending: "Students are still answering. Wait until their attempts finish.",
  student_link_unavailable: "Online exams need a linked student account, which isn’t available yet.",
  content_unavailable: "This exam isn’t available through released content.",
  idempotency_conflict: "This request was already used for a different change. Try again.",
  throttled: "Too many changes in a short time. Wait a moment and try again.",
  unavailable: "Could not reach the server. Check your connection and try again.",
};

const CODES = new Set(Object.keys(MESSAGES));

export function failure(code: ExamErrorCode, retryAfter?: number): ExamFailure {
  return { ok: false, code, message: MESSAGES[code], ...(retryAfter ? { retryAfter } : {}) };
}

/** The exam RPCs raise SQLSTATE P0001 with the code as the message; anything else is unavailable. */
export function failureFromDatabase(error: { code?: string; message?: string; details?: string }): ExamFailure {
  if (error.code !== "P0001" || !error.message || !CODES.has(error.message)) return failure("unavailable");
  if (error.message === "throttled") {
    const seconds = Number.parseInt(error.details ?? "", 10);
    return failure("throttled", Number.isFinite(seconds) && seconds > 0 ? seconds : 60);
  }
  return failure(error.message as ExamErrorCode);
}
