import { z } from "zod";

import {
  ASSIGNMENT_AUDIENCES, ASSIGNMENT_STATES, PART_KINDS, WORK_STATUSES, type Assignment, type AudiencePreview, type PublishFailureReason, type StudentWork,
} from "./types";

/** Parses the database's snake_case assignment document (get_assignment and every command). */
const assignmentSchema = z.object({
  id: z.string(),
  academy_id: z.string(),
  academic_year_id: z.string(),
  title: z.string(),
  instructions: z.string(),
  audience: z.enum(ASSIGNMENT_AUDIENCES),
  level_id: z.string().nullable(),
  track_id: z.string().nullable(),
  group_ids: z.array(z.string()),
  due_at: z.string().nullable(),
  state: z.enum(ASSIGNMENT_STATES),
  max_score: z.string(),
  part_count: z.number().int(),
  recipient_count: z.number().int(),
  version: z.number().int(),
  created_by: z.string(),
  created_at: z.string(),
  updated_by: z.string(),
  updated_at: z.string(),
  published_at: z.string().nullable(),
  closed_at: z.string().nullable(),
  archived_at: z.string().nullable(),
  year_open: z.boolean(),
  has_activity: z.boolean(),
  parts: z.array(z.object({
    id: z.string(), position: z.number().int(), title: z.string(), instructions: z.string(), max_score: z.string(),
    kind: z.enum(PART_KINDS).nullable(),
    issues: z.array(z.enum(["maximum", "questions", "choices", "correct_choice", "prompt", "choice_text"])),
    questions: z.array(z.object({
      id: z.string(), position: z.number().int(), prompt: z.string(), max_score: z.string(),
      choices: z.array(z.object({ id: z.string(), position: z.number().int(), label: z.string(), is_correct: z.boolean() })),
    })),
  })),
});

export function toAssignment(value: unknown): Assignment {
  const row = assignmentSchema.parse(value);
  return {
    id: row.id,
    academyId: row.academy_id,
    academicYearId: row.academic_year_id,
    title: row.title,
    instructions: row.instructions,
    audience: row.audience,
    levelId: row.level_id,
    trackId: row.track_id,
    groupIds: row.group_ids,
    dueAt: row.due_at,
    state: row.state,
    maxScore: row.max_score,
    partCount: row.part_count,
    recipientCount: row.recipient_count,
    version: row.version,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    closedAt: row.closed_at,
    archivedAt: row.archived_at,
    yearOpen: row.year_open,
    hasActivity: row.has_activity,
    parts: row.parts.map((part) => ({
      id: part.id, position: part.position, title: part.title, instructions: part.instructions, maxScore: part.max_score,
      kind: part.kind, issues: part.issues,
      questions: part.questions.map((question) => ({
        id: question.id, position: question.position, prompt: question.prompt, maxScore: question.max_score,
        choices: question.choices.map((choice) => ({ id: choice.id, position: choice.position, label: choice.label, isCorrect: choice.is_correct })),
      })),
    })),
  };
}

const previewSchema = z.object({ recipient_count: z.number().int(), uncoded_count: z.number().int() });

export function toAudiencePreview(value: unknown): AudiencePreview {
  const row = previewSchema.parse(value);
  return { recipientCount: row.recipient_count, uncodedCount: row.uncoded_count };
}

const workStatus = z.enum(WORK_STATUSES);
const studentSchema = z.object({
  annual_student_record_id: z.string(),
  full_name: z.string(),
  archived: z.boolean(),
  group_name: z.string().nullable(),
  student_code: z.string().nullable(),
  work_status: workStatus,
  received_at: z.string().nullable(),
  work_note: z.string(),
  feedback: z.string(),
  version: z.number().int(),
  marks: z.array(z.object({
    part_id: z.string(), kind: z.enum(["mark", "excused"]), score: z.string(), reason: z.string().nullable(), from_answers: z.boolean().default(false),
  })),
  answers: z.array(z.object({ question_id: z.string(), part_id: z.string(), choice_id: z.string().nullable(), score: z.string() })).default([]),
  marked_parts: z.number().int(),
  total: z.string().nullable(),
  marking: z.enum(["unmarked", "partial", "complete"]),
  publication: z.object({ revision: z.number().int(), total: z.string(), work_status: workStatus, published_at: z.string() }).nullable(),
  publication_state: z.enum(["unpublished", "published", "pending_correction"]),
});

export function toStudentWork(value: unknown): StudentWork {
  const row = studentSchema.parse(value);
  return {
    recordId: row.annual_student_record_id,
    fullName: row.full_name,
    archived: row.archived,
    groupName: row.group_name,
    studentCode: row.student_code,
    workStatus: row.work_status,
    receivedAt: row.received_at,
    workNote: row.work_note,
    feedback: row.feedback,
    version: row.version,
    marks: row.marks.map((mark) => ({ partId: mark.part_id, kind: mark.kind, score: mark.score, reason: mark.reason, fromAnswers: mark.from_answers })),
    answers: row.answers.map((answer) => ({ questionId: answer.question_id, partId: answer.part_id, choiceId: answer.choice_id, score: answer.score })),
    markedParts: row.marked_parts,
    total: row.total,
    marking: row.marking,
    publication: row.publication
      ? { revision: row.publication.revision, total: row.publication.total, workStatus: row.publication.work_status, publishedAt: row.publication.published_at }
      : null,
    publicationState: row.publication_state,
  };
}

const listSchema = z.object({ total: z.number().int(), items: z.array(z.unknown()) });

export function toStudentList(value: unknown): { total: number; students: StudentWork[] } {
  const row = listSchema.parse(value);
  return { total: row.total, students: row.items.map(toStudentWork) };
}

const saveSchema = z.object({
  outcome: z.enum(["saved", "unchanged", "conflict"]), recipient: z.unknown(), work_recorded: z.boolean().optional(), replayed: z.boolean().optional(),
});

export function toSaveMarks(value: unknown) {
  const row = saveSchema.parse(value);
  return { outcome: row.outcome, student: toStudentWork(row.recipient), workRecorded: row.work_recorded ?? false, replayed: row.replayed ?? false };
}

const publishSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("published"),
    results: z.array(z.object({ annual_student_record_id: z.string(), outcome: z.enum(["published", "corrected", "unchanged"]), revision: z.number().int() })),
    replayed: z.boolean().optional(),
  }),
  z.object({
    outcome: z.literal("rejected"),
    failures: z.array(z.object({ annual_student_record_id: z.string(), reason: z.enum(["not_recipient", "stale", "incomplete"]) })),
  }),
]);

export function toPublish(value: unknown) {
  const row = publishSchema.parse(value);
  if (row.outcome === "rejected") {
    return { outcome: "rejected" as const, failures: row.failures.map((failure) => ({ recordId: failure.annual_student_record_id, reason: failure.reason as PublishFailureReason })) };
  }
  return {
    outcome: "published" as const,
    results: row.results.map((result) => ({ recordId: result.annual_student_record_id, outcome: result.outcome, revision: result.revision })),
    replayed: row.replayed ?? false,
  };
}
