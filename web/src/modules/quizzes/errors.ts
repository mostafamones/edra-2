import type { QuizErrorCode, QuizFailure } from "./types";

const MESSAGES: Record<QuizErrorCode, string> = {
  validation: "Some details aren’t valid. Check the fields and try again.",
  forbidden: "You don’t have permission to do this in this academy.",
  not_found: "This quiz no longer exists in this academy.",
  year_unavailable: "This academic year is closed, so its quizzes are read-only.",
  quiz_conflict: "Someone else changed this quiz first. Review the latest version and try again.",
  invalid_audience: "The audience is no longer valid. Choose an active level, track or groups in this academic year.",
  target_locked: "Students have started work, so the audience and timer can’t change.",
  structure_locked: "Answers or marks exist, so parts, questions, choices and marks can’t change. Use a key correction or exclusion instead.",
  not_ready: "Finish the audience and every part’s questions, choices and correct answers first.",
  quiz_closed: "This quiz’s window has closed. Accepted work can still be marked and announced.",
  already_open: "The quiz has already opened, so its opening time can’t change.",
  window_locked: "Students have started, so the closing time can only move later.",
  invalid_state: "This action isn’t available for the quiz right now. Refresh and try again.",
  not_eligible: "This student isn’t in the quiz’s audience.",
  not_open: "The quiz isn’t open for new attempts.",
  attempt_finalized: "This attempt has already been submitted.",
  source_conflict: "This student’s work was already accepted from another source. The earlier work stays as history.",
  not_submitted: "This student has no accepted work to mark yet.",
  incomplete: "Some written questions aren’t marked yet.",
  invalid_score: "Enter a mark from 0 up to the question’s maximum, with at most two decimals.",
  question_excluded: "That question is excluded. Its saved answers and marks are kept but can’t change.",
  unknown_question: "That question or choice no longer belongs to this quiz. Refresh and try again.",
  stale_basis: "The answer key or exclusions changed. Refresh to review the recalculated results, then try again.",
  invalid_exclusion: "At least one question must keep counting toward the score.",
  quiz_work_pending: "Students are still answering. Wait until their attempts finish.",
  student_link_unavailable: "Online quizzes need a linked student account, which isn’t available yet.",
  content_unavailable: "This quiz isn’t available through released content.",
  idempotency_conflict: "This request was already used for a different change. Try again.",
  throttled: "Too many changes in a short time. Wait a moment and try again.",
  unavailable: "Could not reach the server. Check your connection and try again.",
};

const CODES = new Set(Object.keys(MESSAGES));

export function failure(code: QuizErrorCode, retryAfter?: number): QuizFailure {
  return { ok: false, code, message: MESSAGES[code], ...(retryAfter ? { retryAfter } : {}) };
}

/** The quiz RPCs raise SQLSTATE P0001 with the code as the message; anything else is unavailable. */
export function failureFromDatabase(error: { code?: string; message?: string; details?: string }): QuizFailure {
  if (error.code !== "P0001" || !error.message || !CODES.has(error.message)) return failure("unavailable");
  if (error.message === "throttled") {
    const seconds = Number.parseInt(error.details ?? "", 10);
    return failure("throttled", Number.isFinite(seconds) && seconds > 0 ? seconds : 60);
  }
  return failure(error.message as QuizErrorCode);
}
