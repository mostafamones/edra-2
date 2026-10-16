import { z } from "zod";

import {
  DEPARTURE_OUTCOMES, EXAM_AUDIENCES, EXAM_PART_KINDS, EXAM_PHASES, EXAM_SOURCES, FINALIZATION_REASONS, PUBLICATION_STATES,
  type AnnounceFailureReason, type Exam, type ExamStudent, type ExamSummary, type StudentDetail,
} from "./types";

/** Parsers for the database's snake_case exam documents (get_exam, list_exams, list_exam_students and commands). */

const decimal = z.string();
const timestamp = z.string();

const examSchema = z.object({
  id: z.string(),
  academy_id: z.string(),
  academic_year_id: z.string(),
  title: z.string(),
  instructions: z.string(),
  solution_notes: z.string(),
  audience: z.enum(EXAM_AUDIENCES).nullable(),
  level_id: z.string().nullable(),
  track_id: z.string().nullable(),
  group_ids: z.array(z.string()),
  time_limit_minutes: z.number().int().nullable(),
  opens_at: timestamp.nullable(),
  closes_at: timestamp.nullable(),
  actual_closes_at: timestamp.nullable(),
  max_score: decimal,
  effective_max_score: decimal,
  question_count: z.number().int(),
  version: z.number().int(),
  scoring_revision: z.number().int(),
  work_started_at: timestamp.nullable(),
  structure_locked_at: timestamp.nullable(),
  closure_settled_at: timestamp.nullable().default(null),
  processing_pending: z.boolean().default(false),
  created_at: timestamp,
  updated_at: timestamp,
  archived_at: timestamp.nullable(),
  year_open: z.boolean(),
  ready: z.boolean(),
  issues: z.array(z.object({
    scope: z.enum(["exam", "part", "question"]), id: z.string(),
    issue: z.enum(["target", "timer", "parts", "questions", "choices", "correct_choice", "choice_text"]),
  })),
  phase: z.enum(EXAM_PHASES),
  server_now: timestamp,
  fully_automatic: z.boolean().default(false),
  counts: z.object({
    eligible: z.number().int(), started: z.number().int(), in_progress: z.number().int(), submitted: z.number().int(), announced: z.number().int(),
  }).default({ eligible: 0, started: 0, in_progress: 0, submitted: 0, announced: 0 }),
  corrections: z.array(z.object({
    revision: z.number().int(), kind: z.enum(["key", "exclusion"]), question_id: z.string(), previous_choice_id: z.string().nullable(),
    choice_id: z.string().nullable(), created_by: z.string(), created_at: timestamp,
  })).default([]),
  parts: z.array(z.object({
    id: z.string(), position: z.number().int(), title: z.string(), instructions: z.string(), kind: z.enum(EXAM_PART_KINDS),
    questions: z.array(z.object({
      id: z.string(), position: z.number().int(), number: z.number().int(), prompt: z.string(), model_answer: z.string(),
      max_score: decimal, excluded: z.boolean(), excluded_at: timestamp.nullable(),
      choices: z.array(z.object({ id: z.string(), position: z.number().int(), label: z.string(), is_correct: z.boolean() })),
    })),
  })),
});

export function toExam(value: unknown): Exam {
  const row = examSchema.parse(value);
  return {
    id: row.id,
    academyId: row.academy_id,
    academicYearId: row.academic_year_id,
    title: row.title,
    instructions: row.instructions,
    solutionNotes: row.solution_notes,
    audience: row.audience,
    levelId: row.level_id,
    trackId: row.track_id,
    groupIds: row.group_ids,
    timeLimitMinutes: row.time_limit_minutes,
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    actualClosesAt: row.actual_closes_at,
    maxScore: row.max_score,
    effectiveMaxScore: row.effective_max_score,
    questionCount: row.question_count,
    version: row.version,
    scoringRevision: row.scoring_revision,
    workStartedAt: row.work_started_at,
    structureLockedAt: row.structure_locked_at,
    closureSettledAt: row.closure_settled_at,
    processingPending: row.processing_pending,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
    yearOpen: row.year_open,
    ready: row.ready,
    issues: row.issues,
    phase: row.phase,
    serverNow: row.server_now,
    fullyAutomatic: row.fully_automatic,
    counts: {
      eligible: row.counts.eligible, started: row.counts.started, inProgress: row.counts.in_progress,
      submitted: row.counts.submitted, announced: row.counts.announced,
    },
    corrections: row.corrections.map((entry) => ({
      revision: entry.revision, kind: entry.kind, questionId: entry.question_id, previousChoiceId: entry.previous_choice_id,
      choiceId: entry.choice_id, createdBy: entry.created_by, createdAt: entry.created_at,
    })),
    parts: row.parts.map((part) => ({
      id: part.id, position: part.position, title: part.title, instructions: part.instructions, kind: part.kind,
      questions: part.questions.map((question) => ({
        id: question.id, position: question.position, number: question.number, prompt: question.prompt, modelAnswer: question.model_answer,
        maxScore: question.max_score, excluded: question.excluded, excludedAt: question.excluded_at,
        choices: question.choices.map((choice) => ({ id: choice.id, position: choice.position, label: choice.label, isCorrect: choice.is_correct })),
      })),
    })),
  };
}

const summarySchema = z.object({
  id: z.string(), academic_year_id: z.string(), title: z.string(), audience: z.enum(EXAM_AUDIENCES).nullable(),
  level_id: z.string().nullable(), track_id: z.string().nullable(), group_ids: z.array(z.string()),
  time_limit_minutes: z.number().int().nullable(), opens_at: timestamp.nullable(), closes_at: timestamp.nullable(),
  actual_closes_at: timestamp.nullable(), max_score: decimal, effective_max_score: decimal, question_count: z.number().int(),
  phase: z.enum(EXAM_PHASES), updated_at: timestamp, submitted: z.number().int(), in_progress: z.number().int(), announced: z.number().int(),
  processing_pending: z.boolean().default(false), closure_settled_at: timestamp.nullable().default(null),
});

export function toExamPage(value: unknown): { total: number; exams: ExamSummary[]; serverNow: string } {
  const page = z.object({ total: z.number().int(), items: z.array(summarySchema), server_now: timestamp }).parse(value);
  return {
    total: page.total,
    serverNow: page.server_now,
    exams: page.items.map((row) => ({
      id: row.id, academicYearId: row.academic_year_id, title: row.title, audience: row.audience, levelId: row.level_id, trackId: row.track_id,
      groupIds: row.group_ids, timeLimitMinutes: row.time_limit_minutes, opensAt: row.opens_at, closesAt: row.closes_at,
      actualClosesAt: row.actual_closes_at, maxScore: row.max_score, effectiveMaxScore: row.effective_max_score, questionCount: row.question_count,
      phase: row.phase, updatedAt: row.updated_at, submitted: row.submitted, inProgress: row.in_progress, announced: row.announced,
      processingPending: row.processing_pending, closureSettledAt: row.closure_settled_at,
    })),
  };
}

const reason = z.enum(FINALIZATION_REASONS);
const studentSchema = z.object({
  annual_student_record_id: z.string(),
  full_name: z.string(),
  archived: z.boolean(),
  group_name: z.string().nullable(),
  student_code: z.string().nullable(),
  eligible: z.boolean(),
  version: z.number().int(),
  attempt: z.object({
    started_at: timestamp, deadline_at: timestamp, departure_count: z.number().int(), answers_version: z.number().int(),
    last_saved_at: timestamp.nullable(), finalized_at: timestamp.nullable(), finalization_reason: reason.nullable(), superseded: z.boolean(),
  }).nullable(),
  physical_draft: z.object({ version: z.number().int(), updated_at: timestamp, answered: z.number().int() }).nullable(),
  submission: z.object({
    id: z.string(), source: z.enum(EXAM_SOURCES), reason, submitted_at: timestamp, processed_at: timestamp,
    original_deadline_at: timestamp.nullable(), scoring_revision: z.number().int(),
  }).nullable(),
  result: z.object({
    complete: z.boolean(), total: decimal, max_score: decimal, marked: z.number().int(), required: z.number().int(),
  }).nullable(),
  feedback: z.string(),
  publication: z.object({
    revision: z.number().int(), total: decimal, max_score: decimal, scoring_revision: z.number().int(), automatic: z.boolean(), published_at: timestamp,
  }).nullable(),
  publication_state: z.enum(PUBLICATION_STATES),
  solutions_qualified: z.boolean(),
  updated_at: timestamp.nullable(),
});

export function toExamStudent(value: unknown): ExamStudent {
  const row = studentSchema.parse(value);
  return {
    recordId: row.annual_student_record_id,
    fullName: row.full_name,
    archived: row.archived,
    groupName: row.group_name,
    studentCode: row.student_code,
    eligible: row.eligible,
    version: row.version,
    attempt: row.attempt && {
      startedAt: row.attempt.started_at, deadlineAt: row.attempt.deadline_at, departureCount: row.attempt.departure_count,
      answersVersion: row.attempt.answers_version, lastSavedAt: row.attempt.last_saved_at, finalizedAt: row.attempt.finalized_at,
      finalizationReason: row.attempt.finalization_reason, superseded: row.attempt.superseded,
    },
    physicalDraft: row.physical_draft && { version: row.physical_draft.version, updatedAt: row.physical_draft.updated_at, answered: row.physical_draft.answered },
    submission: row.submission && {
      id: row.submission.id, source: row.submission.source, reason: row.submission.reason, submittedAt: row.submission.submitted_at,
      processedAt: row.submission.processed_at, originalDeadlineAt: row.submission.original_deadline_at, scoringRevision: row.submission.scoring_revision,
    },
    result: row.result && {
      complete: row.result.complete, total: row.result.total, maxScore: row.result.max_score, marked: row.result.marked, required: row.result.required,
    },
    feedback: row.feedback,
    publication: row.publication && {
      revision: row.publication.revision, total: row.publication.total, maxScore: row.publication.max_score,
      scoringRevision: row.publication.scoring_revision, automatic: row.publication.automatic, publishedAt: row.publication.published_at,
    },
    publicationState: row.publication_state,
    solutionsQualified: row.solutions_qualified,
    updatedAt: row.updated_at,
  };
}

export function toStudentList(value: unknown): { total: number; students: ExamStudent[] } {
  const page = z.object({ total: z.number().int(), items: z.array(z.unknown()) }).parse(value);
  return { total: page.total, students: page.items.map(toExamStudent) };
}

const detailSchema = z.object({
  questions: z.array(z.object({
    question_id: z.string(), number: z.number().int(), kind: z.enum(EXAM_PART_KINDS), max_score: decimal, excluded: z.boolean(),
    online_answer: z.object({ choice_id: z.string().nullable(), text_answer: z.string().nullable(), saved_at: timestamp }).nullable(),
    physical_answer: z.object({ choice_id: z.string().nullable() }).nullable(),
    submitted_answer: z.object({ choice_id: z.string().nullable(), text_answer: z.string().nullable() }).nullable(),
    mark: decimal.nullable(),
    score: decimal.nullable(),
  })),
  departures: z.array(z.object({
    event_id: z.string(), ordinal: z.number().int(), question_id: z.string(), question_number: z.number().int(),
    outcome: z.enum(DEPARTURE_OUTCOMES), next_question_id: z.string().nullable(), recorded_at: timestamp,
  })),
  publications: z.array(z.object({
    revision: z.number().int(), total: decimal, max_score: decimal, scoring_revision: z.number().int(),
    items: z.array(z.object({
      question_id: z.string(), number: z.number().int(), max_score: decimal, excluded: z.boolean(), score: decimal.nullable(),
    })),
    feedback: z.string(), automatic: z.boolean(), published_by: z.string().nullable(), published_at: timestamp,
  })),
});

export function toStudentDetail(value: unknown): { student: ExamStudent; detail: StudentDetail } {
  const row = z.object({ student: z.unknown(), detail: detailSchema }).parse(value);
  return {
    student: toExamStudent(row.student),
    detail: {
      questions: row.detail.questions.map((question) => ({
        questionId: question.question_id, number: question.number, kind: question.kind, maxScore: question.max_score, excluded: question.excluded,
        onlineAnswer: question.online_answer && {
          choiceId: question.online_answer.choice_id, textAnswer: question.online_answer.text_answer, savedAt: question.online_answer.saved_at,
        },
        physicalAnswer: question.physical_answer && { choiceId: question.physical_answer.choice_id },
        submittedAnswer: question.submitted_answer && { choiceId: question.submitted_answer.choice_id, textAnswer: question.submitted_answer.text_answer },
        mark: question.mark,
        score: question.score,
      })),
      departures: row.detail.departures.map((departure) => ({
        eventId: departure.event_id, ordinal: departure.ordinal, questionId: departure.question_id, questionNumber: departure.question_number,
        outcome: departure.outcome, nextQuestionId: departure.next_question_id, recordedAt: departure.recorded_at,
      })),
      publications: row.detail.publications.map((publication) => ({
        revision: publication.revision, total: publication.total, maxScore: publication.max_score, scoringRevision: publication.scoring_revision,
        items: publication.items.map((item) => ({ questionId: item.question_id, number: item.number, maxScore: item.max_score, excluded: item.excluded, score: item.score })),
        feedback: publication.feedback, automatic: publication.automatic, publishedBy: publication.published_by, publishedAt: publication.published_at,
      })),
    },
  };
}

const commandSchema = z.object({
  outcome: z.enum(["saved", "confirmed", "conflict", "source_conflict"]),
  student: z.unknown(),
  replayed: z.boolean().optional(),
});

export function toStudentCommand(value: unknown) {
  const row = commandSchema.parse(value);
  return { outcome: row.outcome, student: toExamStudent(row.student), replayed: row.replayed ?? false };
}

const announceSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("published"),
    results: z.array(z.object({ annual_student_record_id: z.string(), outcome: z.enum(["published", "corrected", "unchanged"]), revision: z.number().int() })),
    replayed: z.boolean().optional(),
  }),
  z.object({
    outcome: z.literal("rejected"),
    failures: z.array(z.object({ annual_student_record_id: z.string(), reason: z.enum(["not_submitted", "stale", "incomplete"]) })),
  }),
]);

export function toAnnounce(value: unknown) {
  const row = announceSchema.parse(value);
  if (row.outcome === "rejected") {
    return {
      outcome: "rejected" as const,
      failures: row.failures.map((entry) => ({ recordId: entry.annual_student_record_id, reason: entry.reason as AnnounceFailureReason })),
    };
  }
  return {
    outcome: "published" as const,
    results: row.results.map((entry) => ({ recordId: entry.annual_student_record_id, outcome: entry.outcome, revision: entry.revision })),
    replayed: row.replayed ?? false,
  };
}

export function toCorrection(value: unknown): Exam {
  return toExam(z.object({ exam: z.unknown() }).parse(value).exam);
}
