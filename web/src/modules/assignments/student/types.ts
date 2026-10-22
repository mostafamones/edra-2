import { z } from "zod";

/** Why the caller cannot edit online work right now (null: editing allowed). */
export const BLOCKED_REASONS = [
  "submitted", "result_announced", "assignment_closed", "online_unavailable", "not_recipient", "in_person_disabled", "entitlement_required",
] as const;
export type BlockedReason = (typeof BLOCKED_REASONS)[number];

const receipt = z.object({ submittedAt: z.string(), late: z.boolean() });
const result = z.object({ total: z.string(), maxScore: z.string(), feedback: z.string(), publishedAt: z.string() });
const summary = z.object({
  id: z.guid(), title: z.string(), dueAt: z.string().nullable(),
  unit: z.object({ id: z.guid(), title: z.string() }).nullable(),
  blockedReason: z.enum(BLOCKED_REASONS).nullable(), canEdit: z.boolean(), required: z.boolean(), started: z.boolean(),
  receipt: receipt.nullable(), result: result.nullable(),
});
export const assignmentSchema = summary.extend({
  instructions: z.string(),
  answerVideos: z.array(z.object({ id: z.guid(), title: z.string() })),
});
export const pageSchema = z.object({ items: z.array(summary), hasMore: z.boolean() });

const choice = z.object({ id: z.guid(), position: z.number().int(), label: z.string() });
const question = z.object({ id: z.guid(), number: z.number().int(), prompt: z.string(), choices: z.array(choice) });
const part = z.object({
  id: z.guid(), title: z.string(), instructions: z.string(),
  kind: z.enum(["online_questions", "answer_sheet", "file_upload"]), questions: z.array(question),
});
const file = z.object({
  id: z.guid(), partId: z.guid(), name: z.string(), size: z.number().int(), mime: z.string(),
  state: z.enum(["pending", "complete"]), path: z.string(),
});
export const editorSchema = z.object({
  generation: z.number().int().positive(), version: z.number().int().min(0), answers: z.record(z.string(), z.guid().nullable()),
  leaseUntil: z.string(), scoringRevision: z.number().int().positive(), parts: z.array(part), files: z.array(file),
});
export const claimSchema = z.union([z.object({ busy: z.literal(true) }), editorSchema]);

export type StudentAssignmentSummary = z.infer<typeof summary>;
export type StudentAssignment = z.infer<typeof assignmentSchema>;
export type StudentAssignmentPage = z.infer<typeof pageSchema>;
export type EditorPart = z.infer<typeof part>;
export type EditorFile = Omit<z.infer<typeof file>, "path">;
export type EditorDocument = Omit<z.infer<typeof editorSchema>, "files"> & { files: EditorFile[] };
export type ClaimOutcome = { busy: true } | EditorDocument;
export type Answers = Record<string, string | null>;

export const ERROR_CODES = [
  "validation", "forbidden", "not_found", "student_unavailable", "editor_stale", "draft_conflict", "idempotency_conflict", "question_excluded",
  "file_limit", "file_unavailable", "files_required", "uploads_pending", "unsupported_file", "throttled", "unavailable", ...BLOCKED_REASONS,
] as const;
export type StudentAssignmentErrorCode = (typeof ERROR_CODES)[number];
export type StudentAssignmentFailure = { ok: false; code: StudentAssignmentErrorCode; message: string };
export type StudentAssignmentResult<T> = { ok: true; data: T } | StudentAssignmentFailure;

export type StudentAssignmentAcademy = { id: string; slug: string; name: string };
