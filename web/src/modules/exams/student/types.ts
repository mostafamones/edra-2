import type { ExamPartKind, ExamPhase, ExamSource, FinalizationReason } from "../types";

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

// ---------------------------------------------------------------------------------------------
// Answering (EDRA-233). The editor token proves which tab/device owns the attempt; the database
// still resolves the signed-in account's record on every call, so a token alone is never authority.

/** The attempt as the answering surface sees it: metadata only, never answers or questions. */
export type StudentExamAttemptState = StudentExamAttempt & { id: string; answersVersion: number };

/** The live editor claim this document holds. */
export type StudentExamEditor = {
  token: string;
  generation: number;
  expiresAt: string;
  heartbeatSeconds: number;
  leaseSeconds: number;
};

export type StudentExamEntryEditor = ({ status: "claimed" } & StudentExamEditor) | { status: "busy"; retryAfter: number };

/** Start/resume plus the editor claim, from one trusted transaction. A busy claim carries no material. */
export type StudentExamEntry = { attempt: StudentExamAttemptState; active: boolean; editor: StudentExamEntryEditor | null };

/** A stored answer: a choice for Question Sheet questions, text for Written Work. */
export type StudentExamAnswer = { choiceId: string | null; text: string | null };

export type StudentExamChoice = { id: string; label: string };

export type StudentExamQuestion = {
  id: string;
  /** Original exam-wide number; exclusions never renumber. */
  number: number;
  prompt: string;
  excluded: boolean;
  kind: ExamPartKind;
  partId: string;
  choices: StudentExamChoice[];
};

export type StudentExamPart = { id: string; title: string; instructions: string; kind: ExamPartKind; questions: StudentExamQuestion[] };

export type StudentExamDeparture = {
  eventId: string;
  ordinal: number;
  questionId: string | null;
  outcome: "warned" | "kicked";
  nextQuestionId: string | null;
};

/** The full answering document for the current editor of an active attempt. */
export type StudentExamAnswering = {
  /** The verified signed-in account (pending answers are stored per account and attempt). */
  accountId: string;
  serverNow: string;
  title: string;
  instructions: string;
  attempt: StudentExamAttemptState;
  editor: Omit<StudentExamEditor, "token">;
  parts: StudentExamPart[];
  excludedQuestionIds: string[];
  answers: Record<string, StudentExamAnswer>;
  departures: StudentExamDeparture[];
};

/** Live state between full reads. */
export type StudentExamBrief = { serverNow: string; attempt: StudentExamAttemptState; excludedQuestionIds: string[] };

/** Finalized or superseded work: status only. The overview shows the official total. */
export type StudentExamTerminal = {
  accountId: string;
  serverNow: string;
  attempt: StudentExamAttemptState;
  submission: { source: ExamSource; reason: FinalizationReason; submittedAt: string } | null;
};

export type StudentExamEditorLostReason = "expired" | "replaced";

type Lost = { kind: "editor_lost"; reason: StudentExamEditorLostReason };
type Finalized = { kind: "finalized"; state: StudentExamTerminal };

export type StudentExamClaimOutcome = ({ kind: "claimed" } & StudentExamEditor) | { kind: "busy"; retryAfter: number } | Finalized;
export type StudentExamReadOutcome = { kind: "state"; state: StudentExamAnswering } | Lost | Finalized;
export type StudentExamHeartbeatOutcome = { kind: "renewed"; expiresAt: string; state: StudentExamBrief } | Lost | Finalized;
export type StudentExamReleaseOutcome = { kind: "released" } | Lost | Finalized;

/** One answer in a save patch: exactly the field the question kind accepts. */
export type StudentExamAnswerPatch = { questionId: string; choiceId: string | null } | { questionId: string; text: string | null };

export type StudentExamSaveOutcome =
  | { kind: "saved"; answersVersion: number; replayed: boolean; state: StudentExamBrief }
  | { kind: "conflict"; answersVersion: number; state: StudentExamBrief }
  /** An earlier acknowledgment may have been replayed (acknowledgedVersion) before the editor was lost. */
  | (Lost & { acknowledgedVersion: number | null })
  | (Finalized & { acknowledged: boolean });

export type StudentExamSubmitOutcome =
  | { kind: "submitted"; replayed: boolean; state: StudentExamTerminal }
  | { kind: "finalized"; replayed: boolean; state: StudentExamTerminal }
  | { kind: "source_conflict"; replayed: boolean; state: StudentExamTerminal }
  | { kind: "conflict"; answersVersion: number; state: StudentExamBrief }
  | Lost;

type Continued = { departure: StudentExamDeparture | null; state: StudentExamBrief };
type Ended = { departure: StudentExamDeparture | null; state: StudentExamTerminal };

export type StudentExamDepartureOutcome =
  | ({ kind: "warned" } & Continued)
  | ({ kind: "duplicate" } & Continued)
  | ({ kind: "kicked" } & Ended)
  | ({ kind: "finalized" } & Ended)
  | Lost;

export type StudentExamImagesOutcome = { kind: "urls"; urls: Record<string, string>; expiresInSeconds: number } | { kind: "editor_lost" } | { kind: "finalized" };

// ---------------------------------------------------------------------------------------------
// Review (EDRA-235): read-only accepted work and released solutions after qualification. No marks,
// maxima or revisions; the official total stays in the overview.

/** The answer frozen in the accepted submission. Paper Written Work has no transcription. */
export type StudentExamReviewAnswer =
  | { state: "choice"; choiceId: string }
  | { state: "text"; text: string }
  | { state: "blank" }
  | { state: "paper_work" };

export type StudentExamReviewQuestion = {
  id: string;
  number: number;
  prompt: string;
  excluded: boolean;
  kind: ExamPartKind;
  choices: StudentExamChoice[];
  answer: StudentExamReviewAnswer;
  correctChoiceId: string | null;
  modelAnswer: string;
};

export type StudentExamReviewPart = { id: string; title: string; instructions: string; kind: ExamPartKind; questions: StudentExamReviewQuestion[] };

export type StudentExamReviewUnavailableReason = "not_submitted" | "awaiting_closure" | "awaiting_result";

export type StudentExamReview =
  | { status: "unavailable"; accountId: string; serverNow: string; reason: StudentExamReviewUnavailableReason }
  | { status: "available"; accountId: string; serverNow: string; source: ExamSource; notes: string; parts: StudentExamReviewPart[] };

export type StudentExamReviewImagesOutcome = { kind: "urls"; urls: Record<string, string>; expiresInSeconds: number } | { kind: "unavailable" };

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
  | "unknown_question"
  | "question_excluded"
  | "idempotency_conflict"
  | "throttled"
  | "unavailable";

export type StudentExamFailure = { ok: false; code: StudentExamErrorCode; message: string; retryAfter?: number };
export type StudentExamRead<T> = { ok: true; data: T } | StudentExamFailure;
export type StudentExamCommandResult<T> = ({ ok: true } & T) | StudentExamFailure;

/** The verified connected academy the student route resolved (students module), passed in by the route. */
export type StudentExamAccess = "active" | "suspended" | "not_started" | "no_current_year";
export type StudentExamAcademy = { id: string; slug: string; name: string; access: StudentExamAccess };
