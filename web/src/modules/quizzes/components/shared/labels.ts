import type { StudentStatus } from "../../status";
import type { FinalizationReason, PublicationState, QuizAudience, QuizIssue, QuizPartKind, QuizPhase } from "../../types";

type BadgeVariant = "default" | "secondary" | "outline" | "destructive";

export const PHASE_LABELS: Record<QuizPhase, string> = {
  preparing: "Preparing",
  ready: "Ready",
  scheduled: "Scheduled",
  open: "Open",
  headroom: "Finishing",
  closed: "Closed",
  archived: "Archived",
};

export const PHASE_HINTS: Record<QuizPhase, string> = {
  preparing: "Setup isn’t complete yet.",
  ready: "Ready for physical work. No online window is set.",
  scheduled: "Opens at the scheduled time.",
  open: "Students can start online attempts.",
  headroom: "Scheduled close has passed. Started attempts may finish until actual closure.",
  closed: "Actual closure has passed; nothing can start or reopen. Unfinished attempts are submitted with their saved answers, and solutions release to qualifying students, when closure is processed.",
  archived: "Archived. Work and results are kept.",
};

/** Shown beside a closed quiz whose due work has not been processed yet. */
export const PROCESSING_PENDING_HINT = "Closure is being processed. Saved answers are submitted with the original cutoff time; counts update once it finishes.";

export const PHASE_BADGE: Record<QuizPhase, BadgeVariant> = {
  preparing: "outline",
  ready: "secondary",
  scheduled: "secondary",
  open: "default",
  headroom: "default",
  closed: "secondary",
  archived: "outline",
};

export const AUDIENCE_LABELS: Record<QuizAudience, string> = { level: "Level", program: "Level and track", groups: "Groups" };

export const KIND_LABELS: Record<QuizPartKind, string> = { question_sheet: "Question Sheet", written_work: "Written Work" };
export const KIND_HINTS: Record<QuizPartKind, string> = {
  question_sheet: "Questions with choices and one correct answer, scored automatically.",
  written_work: "Written answers that staff review and mark by hand.",
};

export const REASON_LABELS: Record<FinalizationReason, string> = {
  submitted: "Submitted by the student",
  timer: "Submitted when the timer ended",
  departure: "Submitted after leaving the quiz twice",
  window_closed: "Submitted at window closure",
  physical: "Physical work confirmed",
};

export const STATUS_LABELS: Record<StudentStatus, string> = {
  not_started: "Not started",
  answering: "Answering online",
  physical_draft: "Physical entry in progress",
  needs_marking: "Needs marking",
  ready_to_announce: "Ready to announce",
  announced: "Announced",
  pending_correction: "Correction not announced",
};

export const STATUS_BADGE: Record<StudentStatus, BadgeVariant> = {
  not_started: "outline",
  answering: "secondary",
  physical_draft: "secondary",
  needs_marking: "destructive",
  ready_to_announce: "default",
  announced: "secondary",
  pending_correction: "default",
};

export const RESULT_LABELS: Record<PublicationState, string> = {
  unpublished: "Not announced",
  published: "Announced",
  pending_correction: "Correction not announced",
};

export const ISSUE_LABELS: Record<QuizIssue["issue"], string> = {
  target: "Choose who the quiz is for",
  parts: "Add at least one part",
  questions: "A part has no questions",
  choices: "A question needs at least two choices",
  correct_choice: "A question needs its correct answer",
  choice_text: "A choice has no text",
  prompt: "A question has no text or image",
};

/** "A", "B", … for choice positions. */
export const choiceLetter = (position: number) => String.fromCharCode(64 + position);
