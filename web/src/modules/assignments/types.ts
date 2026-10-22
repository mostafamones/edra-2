import type { AcademyRole } from "@/modules/academies/roles";

/** Operational states. Structure readiness (`ready`) and student visibility are separate properties. */
export const ASSIGNMENT_STATES = ["active", "closed", "archived"] as const;
export const ASSIGNMENT_AUDIENCES = ["level", "program", "groups"] as const;
export const ASSIGNMENT_ACTIONS = ["close", "reopen", "archive"] as const;

export type AssignmentState = (typeof ASSIGNMENT_STATES)[number];
export type AssignmentAudience = (typeof ASSIGNMENT_AUDIENCES)[number];
export type AssignmentAction = (typeof ASSIGNMENT_ACTIONS)[number];
export type StaffRole = AcademyRole;

export const PART_KINDS = ["online_questions", "answer_sheet", "file_upload"] as const;
/** The submission type of a part. A null kind marks a legacy maximum-only part (never creatable). */
export type PartKind = (typeof PART_KINDS)[number];

/** Unresolved configuration of a part; a part with none is complete. */
export type PartIssue = "maximum" | "questions" | "choices" | "correct_choice" | "prompt" | "choice_text";

export type QuestionChoice = { id: string; position: number; label: string; isCorrect: boolean };

/** One question (online), numbered entry (answer sheet), or numbered entry (file upload). */
export type PartQuestion = {
  excluded?: boolean;
  id: string;
  position: number;
  prompt: string;
  /** Exact decimal string. */
  maxScore: string;
  choices: QuestionChoice[];
};

/** Staff contract: includes the answer key. A student-safe projection never carries `isCorrect`. */
export type AssignmentPart = {
  authoredMaxScore?: string;
  id: string;
  position: number;
  title: string;
  instructions: string;
  /** Exact decimal string; derived from the questions of a typed part. */
  maxScore: string;
  kind: PartKind | null;
  issues: PartIssue[];
  questions: PartQuestion[];
};

export type AssignmentCorrection = { revision: number; questionId: string; partId: string; operation: "key" | "exclusion"; previousChoiceId: string | null; choiceId: string | null; previousMaxScore: string; maxScore: string; createdBy: string; createdAt: string };

export type Assignment = {
  scoringRevision?: number;
  authoredMaxScore?: string;
  corrections?: AssignmentCorrection[];
  id: string;
  academyId: string;
  academicYearId: string;
  title: string;
  instructions: string;
  audience: AssignmentAudience;
  levelId: string | null;
  trackId: string | null;
  groupIds: string[];
  /** Advisory only. */
  dueAt: string | null;
  state: AssignmentState;
  /** Sum of the part maxima, maintained by the database. */
  maxScore: string;
  partCount: number;
  /** Captured required cohort, including ended requirements; never includes optional late work. */
  recipientCount: number;
  cohortRevision?: number;
  cohort?: { revision: number; source: "existing_recipients" | "first_audience" | "audience_reset"; capturedAt: string; audienceBasis: { audience: AssignmentAudience; levelId: string | null; trackId: string | null; groupIds: string[] } } | null;
  currentRequiredCount?: number;
  eligibleCount?: number;
  optionalEligibleCount?: number;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  /** Provenance of the retired Publish action; never a visibility switch. */
  publishedAt: string | null;
  closedAt: string | null;
  archivedAt: string | null;
  yearOpen: boolean;
  /** True once a recipient has activity (work, marks, or a result) that locks structure and the configured target audience. */
  hasActivity: boolean;
  /** Every part is complete, so work can be recorded, marked, and announced. */
  ready: boolean;
  parts: AssignmentPart[];
};

/** A saved draft document: the whole editable structure, sent with every create or edit. */
export type AssignmentDraft = {
  title: string;
  instructions: string;
  audience: AssignmentAudience;
  levelId: string | null;
  trackId: string | null;
  groupIds: string[];
  dueAt: string | null;
  /** Existing parts keep their id; new parts have none. */
  parts: DraftPart[];
};

/**
 * A typed part sends its questions; its maximum is derived by the database. A legacy part
 * (`kind` null, only for an existing untyped part) sends its stored maximum and no questions.
 */
export type DraftPart = {
  id?: string;
  title: string;
  instructions: string;
  kind: PartKind | null;
  maxScore: string;
  questions: DraftQuestion[];
};
export type DraftQuestion = { id?: string; prompt: string; maxScore: string; choices: { id?: string; label: string; isCorrect: boolean }[] };

export type AudiencePreview = { recipientCount: number; uncodedCount: number };

export type AssignmentErrorCode =
  | "online_draft"
  | "not_qualified"
  | "source_locked"
  | "validation"
  | "forbidden"
  | "not_found"
  | "year_unavailable"
  | "stale_basis"
  | "question_excluded"
  | "assignment_conflict"
  | "invalid_audience"
  | "invalid_state"
  | "structure_locked"
  | "incomplete"
  | "has_activity"
  | "not_recipient"
  | "invalid_score"
  | "unknown_part"
  | "assignment_closed"
  | "has_marks"
  | "student_codes_disabled"
  | "student_code_not_found"
  | "student_code_retired"
  | "student_code_ambiguous"
  | "student_changed"
  | "idempotency_conflict"
  | "throttled"
  | "unavailable";

export const WORK_STATUSES = ["expected", "submitted", "late", "missing", "excused"] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];
export type MarkingState = "unmarked" | "partial" | "complete";
export type PublicationState = "unpublished" | "published" | "pending_correction";

/** `fromAnswers`: derived from the part's per-question answers; false for a fast (typed) or excused mark. */
export type StudentMark = { requiresRemark?: boolean; partId: string; kind: "mark" | "excused"; score: string; reason: string | null; fromAnswers: boolean };

/** One question's entry: the chosen choice (null = left blank) for choice parts, or the mark for manual parts. */
export type StudentAnswer = { questionId: string; partId: string; choiceId: string | null; score: string };

/** One recipient's work, marks, and result state: the row staff mark and announce. */
export type MarkBasisHistory = { revision: number; partId: string; mark: { score: string; maxScore: string; kind: "mark" | "excused"; reason: string | null; fromAnswers: boolean; requiresRemark: boolean; scoringRevision: number } };
export type AssignmentPublication = { revision: number; scoringRevision: number; total: string; maxScore: string; feedback: string; publishedAt: string };
export type StudentWork = {
  scoringRevision?: number;
  markHistory?: MarkBasisHistory[];
  publications?: AssignmentPublication[];
  recordId: string;
  /** Additive cohort contract. Older payloads default to required, never retroactively optional. */
  required?: boolean;
  requirementEndedAt?: string | null;
  requirementSource?: "required_cohort" | "late_eligibility";
  cohortRevision?: number | null;
  /** Matches current active academy/year placement; delivery state is checked by commands. */
  eligible?: boolean;
  fullName: string;
  archived: boolean;
  groupName: string | null;
  /** Current placement for staff filters; command responses omit it. */
  placement?: { groupId: string | null; trackId: string | null; trackName: string | null };
  studentCode: string | null;
  workStatus: WorkStatus;
  receivedAt: string | null;
  workNote: string;
  feedback: string;
  /** Per-student version for marks, feedback, and work status. */
  version: number;
  marks: StudentMark[];
  answers: StudentAnswer[];
  markedParts: number;
  /** When the student's marks, work status, or feedback last changed; null if the payload omits it. */
  updatedAt: string | null;
  /** Sum of the marked parts, or null while nothing is marked. */
  total: string | null;
  marking: MarkingState;
  /** The official (announced) snapshot; null until the result is announced. */
  publication: { maxScore?: string; scoringRevision?: number; revision: number; total: string; workStatus: WorkStatus; publishedAt: string } | null;
  publicationState: PublicationState;
};

/** One part's change: `score` null clears it; `excusedReason` records an excused adjustment. */
export type MarkChange = { partId: string; score: string | null; excusedReason?: string };

/** One question's change: a choice (null = left blank) for choice parts, a mark for manual parts, or clear. */
export type AnswerChange = { questionId: string } & ({ choiceId: string | null } | { score: string } | { clear: true });

export type StudentSort = "default" | "marks_desc" | "marked_desc";

export type MarkFilter = "all" | "not_received" | "needs_marking" | "marked" | "unpublished";

export type SaveMarksOutcome =
  | { ok: true; outcome: "saved" | "unchanged"; student: StudentWork; workRecorded: boolean; replayed: boolean }
  | { ok: true; outcome: "conflict"; student: StudentWork; workRecorded: false; replayed: boolean };
export type SaveMarksResult = SaveMarksOutcome | AssignmentFailure;

export type WorkResult = { ok: true; outcome: "saved" | "unchanged" | "conflict"; student: StudentWork } | AssignmentFailure;

export type PublishFailureReason = "not_recipient" | "stale" | "incomplete";
export type PublishResult =
  | { ok: true; outcome: "published"; results: { recordId: string; outcome: "published" | "corrected" | "unchanged"; revision: number }[]; replayed: boolean }
  | { ok: true; outcome: "rejected"; failures: { recordId: string; reason: PublishFailureReason }[] }
  | AssignmentFailure;

export type StudentLookup = { ok: true; student: StudentWork } | AssignmentFailure;

export type AssignmentFailure = { ok: false; code: AssignmentErrorCode; message: string; retryAfter?: number };
export type AssignmentResult = { ok: true; assignment: Assignment } | AssignmentFailure;
export type ReadResult<T> = { ok: true; data: T } | { ok: false; status: 400 | 403 | 404 | 500 };
