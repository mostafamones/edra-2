import type { ExamPhase, ExamSource, FinalizationReason } from "../types";

/**
 * Server-derived entry state. Browser fullscreen capability and the answering/departure
 * integrations are further client restrictions, never authorization.
 */
export const STUDENT_EXAM_ACTIONS = ["start", "resume", "submitted", "not_yet_open", "no_new_starts", "ineligible", "unavailable"] as const;
export type StudentExamAction = (typeof STUDENT_EXAM_ACTIONS)[number];

export const STUDENT_EXAM_PAGE_SIZE = 20;

/** One discoverable exam in the academy list: link, status and timing only. */
export type StudentExamSummary = {
  examId: string;
  title: string;
  timeLimitMinutes: number | null;
  opensAt: string | null;
  /** Scheduled close: no new attempts from here. */
  closesAt: string | null;
  /** Actual close (scheduled close plus the completion period). */
  actualClosesAt: string | null;
  phase: ExamPhase;
  action: StudentExamAction;
};

export type StudentExamPage = { total: number; items: StudentExamSummary[]; serverNow: string };

export type StudentExamAttempt = {
  startedAt: string;
  deadlineAt: string;
  /** The earlier of the individual deadline and actual closure. */
  cutoffAt: string;
  departureCount: number;
  finalizedAt: string | null;
  finalizationReason: Exclude<FinalizationReason, "physical"> | null;
  superseded: boolean;
};

export type StudentExamSubmission = {
  source: ExamSource;
  reason: FinalizationReason;
  submittedAt: string;
  processedAt: string;
};

/** The current official result: total only, never a per-part or per-question breakdown. */
export type StudentExamResult = {
  total: string;
  maxScore: string;
  publishedAt: string;
  corrected: boolean;
  correctedAt: string | null;
};

export type StudentExamOverview = {
  examId: string;
  title: string;
  instructions: string;
  timeLimitMinutes: number | null;
  opensAt: string | null;
  closesAt: string | null;
  actualClosesAt: string | null;
  serverNow: string;
  phase: ExamPhase;
  action: StudentExamAction;
  attempt: StudentExamAttempt | null;
  submission: StudentExamSubmission | null;
  result: StudentExamResult | null;
};

/** Acknowledged start/resume: the single attempt and whether it is still active. */
export type StudentExamStart = { attempt: StudentExamAttempt; active: boolean };

export type StudentExamErrorCode =
  | "validation"
  | "forbidden"
  | "not_found"
  | "student_link_unavailable"
  | "content_unavailable"
  | "year_unavailable"
  | "not_open"
  | "not_eligible"
  | "source_conflict"
  | "throttled"
  | "unavailable";

export type StudentExamFailure = { ok: false; code: StudentExamErrorCode; message: string; retryAfter?: number };
export type StudentExamRead<T> = { ok: true; data: T } | StudentExamFailure;
export type StudentExamStartResult = ({ ok: true } & StudentExamStart) | StudentExamFailure;

/** The verified connected academy the student route resolved (students module), passed in by the route. */
export type StudentExamAccess = "active" | "suspended" | "no_current_year";
export type StudentExamAcademy = { id: string; slug: string; name: string; access: StudentExamAccess };
