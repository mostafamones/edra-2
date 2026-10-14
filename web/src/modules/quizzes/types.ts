import type { AcademyRole } from "@/modules/academies/roles";

export const QUIZ_AUDIENCES = ["level", "program", "groups"] as const;
export const QUIZ_PART_KINDS = ["question_sheet", "written_work"] as const;
/** Derived by the database from readiness, the availability window and archive state. */
export const QUIZ_PHASES = ["preparing", "ready", "scheduled", "open", "headroom", "closed", "archived"] as const;
export const FINALIZATION_REASONS = ["submitted", "timer", "departure", "window_closed", "physical"] as const;
export const QUIZ_SOURCES = ["online", "physical"] as const;
export const PUBLICATION_STATES = ["unpublished", "published", "pending_correction"] as const;

export type QuizAudience = (typeof QUIZ_AUDIENCES)[number];
export type QuizPartKind = (typeof QUIZ_PART_KINDS)[number];
export type QuizPhase = (typeof QUIZ_PHASES)[number];
export type FinalizationReason = (typeof FINALIZATION_REASONS)[number];
export type QuizSource = (typeof QUIZ_SOURCES)[number];
export type PublicationState = (typeof PUBLICATION_STATES)[number];
export type StaffRole = AcademyRole;

/** Unresolved configuration; an empty list means the quiz is ready to receive work. */
export type QuizIssue = {
  scope: "quiz" | "part" | "question";
  id: string;
  issue: "target" | "parts" | "questions" | "choices" | "correct_choice" | "choice_text";
};

/** Staff contract: includes the key and model answers. Student projections never carry them before qualification. */
export type QuizChoice = { id: string; position: number; label: string; isCorrect: boolean };
export type QuizQuestion = {
  id: string;
  position: number;
  /** Original quiz-wide number; kept after exclusion. */
  number: number;
  prompt: string;
  modelAnswer: string;
  /** Exact decimal string. */
  maxScore: string;
  excluded: boolean;
  excludedAt: string | null;
  choices: QuizChoice[];
};
export type QuizPart = { id: string; position: number; title: string; instructions: string; kind: QuizPartKind; questions: QuizQuestion[] };

export type QuizCorrection = {
  revision: number;
  kind: "key" | "exclusion";
  questionId: string;
  previousChoiceId: string | null;
  choiceId: string | null;
  createdBy: string;
  createdAt: string;
};

export type Quiz = {
  id: string;
  academyId: string;
  academicYearId: string;
  title: string;
  instructions: string;
  solutionNotes: string;
  audience: QuizAudience | null;
  levelId: string | null;
  trackId: string | null;
  groupIds: string[];
  timeLimitMinutes: number | null;
  opensAt: string | null;
  /** Scheduled close: no new attempts from here. */
  closesAt: string | null;
  /** Scheduled close plus two minutes: unfinished work is submitted and solutions release. */
  actualClosesAt: string | null;
  /** Authored maximum (every question). */
  maxScore: string;
  /** Maximum without excluded questions. */
  effectiveMaxScore: string;
  questionCount: number;
  version: number;
  scoringRevision: number;
  workStartedAt: string | null;
  structureLockedAt: string | null;
  closureSettledAt: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  yearOpen: boolean;
  ready: boolean;
  issues: QuizIssue[];
  phase: QuizPhase;
  serverNow: string;
  /** No scored Written Work: accepted online work is announced automatically. */
  fullyAutomatic: boolean;
  counts: { eligible: number; started: number; inProgress: number; submitted: number; announced: number };
  corrections: QuizCorrection[];
  parts: QuizPart[];
};

/** The preparation document sent with every create or edit. Existing parts/questions/choices keep their id. */
export type QuizDraft = {
  title: string;
  instructions: string;
  solutionNotes: string;
  audience: QuizAudience | null;
  levelId: string | null;
  trackId: string | null;
  groupIds: string[];
  timeLimitMinutes: number | null;
  parts: DraftPart[];
};
export type DraftPart = { id?: string; title: string; instructions: string; kind: QuizPartKind; questions: DraftQuestion[] };
export type DraftQuestion = { id?: string; prompt: string; modelAnswer: string; maxScore: string; choices: { id?: string; label: string; isCorrect: boolean }[] };

export type QuizSummary = {
  id: string;
  academicYearId: string;
  title: string;
  audience: QuizAudience | null;
  levelId: string | null;
  trackId: string | null;
  groupIds: string[];
  timeLimitMinutes: number | null;
  opensAt: string | null;
  closesAt: string | null;
  actualClosesAt: string | null;
  maxScore: string;
  effectiveMaxScore: string;
  questionCount: number;
  phase: QuizPhase;
  updatedAt: string;
  submitted: number;
  inProgress: number;
  announced: number;
};

/** One student row in the staff work list: roster, attempt, physical draft, accepted work and results. */
export type QuizStudent = {
  recordId: string;
  fullName: string;
  archived: boolean;
  groupName: string | null;
  studentCode: string | null;
  /** Currently matches the target. Historical participants may not. */
  eligible: boolean;
  /** Work version for marks, feedback and announcement (0 before any work). */
  version: number;
  attempt: {
    startedAt: string;
    deadlineAt: string | null;
    departureCount: number;
    answersVersion: number;
    lastSavedAt: string | null;
    finalizedAt: string | null;
    finalizationReason: FinalizationReason | null;
    superseded: boolean;
  } | null;
  physicalDraft: { version: number; updatedAt: string; answered: number } | null;
  submission: {
    id: string;
    source: QuizSource;
    reason: FinalizationReason;
    submittedAt: string;
    processedAt: string;
    originalDeadlineAt: string | null;
    scoringRevision: number;
  } | null;
  /** Private current result on the accepted submission; never shown to students. */
  result: { complete: boolean; total: string; maxScore: string; marked: number; required: number } | null;
  feedback: string;
  /** The official (latest announced) revision. */
  publication: { revision: number; total: string; maxScore: string; scoringRevision: number; automatic: boolean; publishedAt: string } | null;
  publicationState: PublicationState;
  solutionsQualified: boolean;
  updatedAt: string | null;
};

export type QuestionDetail = {
  questionId: string;
  number: number;
  kind: QuizPartKind;
  maxScore: string;
  excluded: boolean;
  onlineAnswer: { choiceId: string | null; textAnswer: string | null; savedAt: string } | null;
  physicalAnswer: { choiceId: string | null } | null;
  submittedAnswer: { choiceId: string | null; textAnswer: string | null } | null;
  /** Staff mark on a Written Work question; null when unmarked. */
  mark: string | null;
  /** The question's current private score on the accepted submission; null when unmarked or not submitted. */
  score: string | null;
};

export type ResultRevision = {
  revision: number;
  total: string;
  maxScore: string;
  scoringRevision: number;
  items: { questionId: string; number: number; maxScore: string; excluded: boolean; score: string | null }[];
  feedback: string;
  automatic: boolean;
  publishedBy: string | null;
  publishedAt: string;
};

export type StudentDetail = { questions: QuestionDetail[]; departures: string[]; publications: ResultRevision[] };

export type QuizErrorCode =
  | "validation"
  | "forbidden"
  | "not_found"
  | "year_unavailable"
  | "quiz_conflict"
  | "invalid_audience"
  | "target_locked"
  | "structure_locked"
  | "not_ready"
  | "quiz_closed"
  | "already_open"
  | "window_locked"
  | "invalid_state"
  | "not_eligible"
  | "not_open"
  | "attempt_finalized"
  | "source_conflict"
  | "not_submitted"
  | "incomplete"
  | "invalid_score"
  | "question_excluded"
  | "unknown_question"
  | "stale_basis"
  | "invalid_exclusion"
  | "quiz_work_pending"
  | "student_link_unavailable"
  | "content_unavailable"
  | "idempotency_conflict"
  | "throttled"
  | "unavailable";

export type QuizFailure = { ok: false; code: QuizErrorCode; message: string; retryAfter?: number };
export type QuizResult = { ok: true; quiz: Quiz } | QuizFailure;
export type ReadResult<T> = { ok: true; data: T } | { ok: false; status: 400 | 403 | 404 | 500 };

export type StudentWorkResult =
  | { ok: true; outcome: "saved" | "confirmed" | "conflict" | "source_conflict"; student: QuizStudent; replayed: boolean }
  | QuizFailure;

export type AnnounceFailureReason = "not_submitted" | "stale" | "incomplete";
export type AnnounceResult =
  | { ok: true; outcome: "published"; results: { recordId: string; outcome: "published" | "corrected" | "unchanged"; revision: number }[]; replayed: boolean }
  | { ok: true; outcome: "rejected"; failures: { recordId: string; reason: AnnounceFailureReason }[] }
  | QuizFailure;
