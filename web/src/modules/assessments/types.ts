import { ASSIGNMENT_STATES, type AssignmentState, type PartKind } from "@/modules/assignments";
import { EXAM_PHASES, type ExamPartKind, type ExamPhase } from "@/modules/exams";
import type { Label } from "@/modules/labels";
import { QUIZ_PHASES, type QuizPartKind, type QuizPhase } from "@/modules/quizzes";

export const ASSESSMENT_TYPES = ["assignment", "quiz", "exam"] as const;
export type AssessmentType = (typeof ASSESSMENT_TYPES)[number];

/** Route segment of each type's existing create, detail and edit pages. */
export const TYPE_ROUTES: Record<AssessmentType, string> = { assignment: "assignments", quiz: "quizzes", exam: "exams" };
export const TYPE_LABELS: Record<AssessmentType, string> = { assignment: "Assignment", quiz: "Quiz", exam: "Exam" };
export const TYPE_PLURALS: Record<AssessmentType, string> = { assignment: "Assignments", quiz: "Quizzes", exam: "Exams" };

/** Each type's own statuses, in its own order. Assignment states and quiz/exam phases are never merged. */
export const TYPE_STATUSES: Record<AssessmentType, readonly string[]> = { assignment: ASSIGNMENT_STATES, quiz: QUIZ_PHASES, exam: EXAM_PHASES };
/** "quiz:open": a status always qualified by its type. */
export type StatusKey = `${AssessmentType}:${string}`;
export const statusKey = (type: AssessmentType, status: string): StatusKey => `${type}:${status}`;
export const STATUS_KEYS: readonly StatusKey[] = ASSESSMENT_TYPES.flatMap((type) => TYPE_STATUSES[type].map((status) => statusKey(type, status)));
/** Everything but archived. */
export const DEFAULT_STATUSES: readonly StatusKey[] = STATUS_KEYS.filter((key) => !key.endsWith(":archived"));

type Common = {
  id: string;
  title: string;
  academicYearId: string;
  audience: "level" | "program" | "groups" | null;
  levelId: string | null;
  trackId: string | null;
  groupIds: string[];
  /** Exact decimal text; quizzes and exams count non-excluded questions only. */
  maxScore: string;
  /** Students whose work is fully marked, and the audience they belong to (the workspace stat meanings). */
  markedCount: number;
  audienceCount: number;
  createdAt: string;
  /** Staff-only organizational labels from the academy catalog, by name. */
  labels: Label[];
};

/** One row of the staff Assessments list. Identity is type plus ID; each type keeps its own status. */
export type AssessmentListItem =
  | (Common & { type: "assignment"; status: AssignmentState; dueAt: string | null; parts: Part<PartKind | null>[] })
  | (Common & { type: "quiz"; status: QuizPhase; opensAt: string | null; closesAt: string | null; processingPending: boolean; parts: Part<QuizPartKind>[] })
  | (Common & { type: "exam"; status: ExamPhase; opensAt: string | null; closesAt: string | null; processingPending: boolean; parts: Part<ExamPartKind>[] });

/** In order; a null assignment kind is a legacy marks-only part. */
export type Part<K> = { title: string; kind: K };

export type AssessmentPage = { total: number; items: AssessmentListItem[] };

export const itemKey = (item: { type: AssessmentType; id: string }) => `${item.type}:${item.id}`;

/** What both views render: the item plus its resolved workspace link and audience name. */
export type AssessmentRow = { item: AssessmentListItem; href: string; audience: string };
