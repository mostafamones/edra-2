import { z } from "zod";

import { EXAM_PART_KINDS, EXAM_PHASES, EXAM_SOURCES, FINALIZATION_REASONS } from "../types";
import {
  STUDENT_EXAM_ACTIONS, type StudentExamAnswering, type StudentExamAttemptState, type StudentExamBrief, type StudentExamClaimOutcome,
  type StudentExamDeparture, type StudentExamDepartureOutcome, type StudentExamEntry, type StudentExamHeartbeatOutcome,
  type StudentExamOverview, type StudentExamPage, type StudentExamReadOutcome, type StudentExamReleaseOutcome, type StudentExamSaveOutcome,
  type StudentExamSubmitOutcome, type StudentExamTerminal,
} from "./types";

/**
 * Allowlist parsers for the student exam RPCs. Unknown fields are dropped and an unexpected shape
 * throws, so callers fail closed instead of forwarding unvetted data to the browser.
 */

const timestamp = z.string();

const window = {
  time_limit_minutes: z.number().int().nullable(),
  opens_at: timestamp.nullable(),
  closes_at: timestamp.nullable(),
  actual_closes_at: timestamp.nullable(),
  phase: z.enum(EXAM_PHASES),
  action: z.enum(STUDENT_EXAM_ACTIONS),
};

const pageSchema = z.object({
  total: z.number().int().nonnegative(),
  server_now: timestamp,
  items: z.array(z.object({ exam_id: z.string(), title: z.string(), ...window })),
});

const attemptSchema = z.object({
  started_at: timestamp,
  deadline_at: timestamp,
  cutoff_at: timestamp,
  departure_count: z.number().int(),
  finalized_at: timestamp.nullable(),
  finalization_reason: z.enum(FINALIZATION_REASONS).exclude(["physical"]).nullable(),
  superseded: z.boolean(),
});

const overviewSchema = z.object({
  exam_id: z.string(),
  title: z.string(),
  instructions: z.string(),
  server_now: timestamp,
  ...window,
  attempt: attemptSchema.nullable(),
  submission: z.object({
    source: z.enum(EXAM_SOURCES), reason: z.enum(FINALIZATION_REASONS), submitted_at: timestamp, processed_at: timestamp,
  }).nullable(),
  result: z.object({
    total: z.string(), max_score: z.string(), published_at: timestamp, corrected: z.boolean(), corrected_at: timestamp.nullable(),
  }).nullable(),
});

type Window = { time_limit_minutes: number | null; opens_at: string | null; closes_at: string | null; actual_closes_at: string | null };

function toWindow(value: Window) {
  return { timeLimitMinutes: value.time_limit_minutes, opensAt: value.opens_at, closesAt: value.closes_at, actualClosesAt: value.actual_closes_at };
}

function toAttempt(value: z.infer<typeof attemptSchema>) {
  return {
    startedAt: value.started_at, deadlineAt: value.deadline_at, cutoffAt: value.cutoff_at, departureCount: value.departure_count,
    finalizedAt: value.finalized_at, finalizationReason: value.finalization_reason, superseded: value.superseded,
  };
}

export function toStudentExamPage(value: unknown): StudentExamPage {
  const page = pageSchema.parse(value);
  return {
    total: page.total,
    serverNow: page.server_now,
    items: page.items.map((item) => ({ examId: item.exam_id, title: item.title, ...toWindow(item), phase: item.phase, action: item.action })),
  };
}

export function toStudentExamOverview(value: unknown): StudentExamOverview {
  const overview = overviewSchema.parse(value);
  return {
    examId: overview.exam_id,
    title: overview.title,
    instructions: overview.instructions,
    ...toWindow(overview),
    serverNow: overview.server_now,
    phase: overview.phase,
    action: overview.action,
    attempt: overview.attempt && toAttempt(overview.attempt),
    submission: overview.submission && {
      source: overview.submission.source, reason: overview.submission.reason,
      submittedAt: overview.submission.submitted_at, processedAt: overview.submission.processed_at,
    },
    result: overview.result && {
      total: overview.result.total, maxScore: overview.result.max_score, publishedAt: overview.result.published_at,
      corrected: overview.result.corrected, correctedAt: overview.result.corrected_at,
    },
  };
}


// ---------------------------------------------------------------------------------------------
// Answering (EDRA-233).

const uuid = z.uuid();

const attemptStateSchema = attemptSchema.extend({ id: uuid, answers_version: z.number().int().nonnegative() });

function toAttemptState(value: z.infer<typeof attemptStateSchema>): StudentExamAttemptState {
  return { ...toAttempt(value), id: value.id, answersVersion: value.answers_version };
}

const editorSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/),
  generation: z.number().int().positive(),
  expires_at: timestamp,
  heartbeat_seconds: z.number().int().positive(),
  lease_seconds: z.number().int().positive(),
});

function toEditor(value: z.infer<typeof editorSchema>) {
  return {
    token: value.token, generation: value.generation, expiresAt: value.expires_at,
    heartbeatSeconds: value.heartbeat_seconds, leaseSeconds: value.lease_seconds,
  };
}

const busySchema = z.object({ status: z.literal("busy"), retry_after: z.number().int().positive() });

const entrySchema = z.object({
  attempt: attemptStateSchema,
  active: z.boolean(),
  editor: z.union([editorSchema.extend({ status: z.literal("claimed") }), busySchema]).nullable(),
});

export function toStudentExamEntry(value: unknown): StudentExamEntry {
  const entry = entrySchema.parse(value);
  const editor = entry.editor === null ? null
    : entry.editor.status === "busy" ? { status: "busy" as const, retryAfter: entry.editor.retry_after }
    : { status: "claimed" as const, ...toEditor(entry.editor) };
  return { attempt: toAttemptState(entry.attempt), active: entry.active && editor !== null, editor };
}

const briefSchema = z.object({ server_now: timestamp, attempt: attemptStateSchema, excluded_question_ids: z.array(uuid) });

function toBrief(value: z.infer<typeof briefSchema>): StudentExamBrief {
  return { serverNow: value.server_now, attempt: toAttemptState(value.attempt), excludedQuestionIds: value.excluded_question_ids };
}

const terminalSchema = z.object({
  account_id: uuid,
  server_now: timestamp,
  attempt: attemptStateSchema,
  submission: z.object({ source: z.enum(EXAM_SOURCES), reason: z.enum(FINALIZATION_REASONS), submitted_at: timestamp }).nullable(),
});

function toTerminal(value: z.infer<typeof terminalSchema>): StudentExamTerminal {
  return {
    accountId: value.account_id,
    serverNow: value.server_now,
    attempt: toAttemptState(value.attempt),
    submission: value.submission && { source: value.submission.source, reason: value.submission.reason, submittedAt: value.submission.submitted_at },
  };
}

const lostReason = z.enum(["expired", "replaced"]);
const finalizedSchema = z.object({ status: z.literal("finalized"), state: terminalSchema });

const departureSchema = z.object({
  event_id: uuid, ordinal: z.number().int().min(1).max(3), question_id: uuid.nullable(),
  outcome: z.enum(["warned", "kicked"]), next_question_id: uuid.nullable(),
});

function toDeparture(value: z.infer<typeof departureSchema>): StudentExamDeparture {
  return { eventId: value.event_id, ordinal: value.ordinal, questionId: value.question_id, outcome: value.outcome, nextQuestionId: value.next_question_id };
}

const claimSchema = z.discriminatedUnion("status", [editorSchema.extend({ status: z.literal("claimed") }), busySchema, finalizedSchema]);

export function toStudentExamClaim(value: unknown): StudentExamClaimOutcome {
  const claim = claimSchema.parse(value);
  if (claim.status === "busy") return { kind: "busy", retryAfter: claim.retry_after };
  if (claim.status === "finalized") return { kind: "finalized", state: toTerminal(claim.state) };
  return { kind: "claimed", ...toEditor(claim) };
}

const lostSchema = z.object({ status: z.literal("lost"), reason: lostReason });

const answeringSchema = z.object({
  account_id: uuid,
  server_now: timestamp,
  title: z.string(),
  instructions: z.string(),
  attempt: attemptStateSchema,
  editor: editorSchema.omit({ token: true }),
  parts: z.array(z.object({
    id: uuid, title: z.string(), instructions: z.string().nullable(), kind: z.enum(EXAM_PART_KINDS),
    questions: z.array(z.object({
      id: uuid, number: z.number().int().positive(), prompt: z.string(), excluded: z.boolean(),
      choices: z.array(z.object({ id: uuid, label: z.string() })),
    })),
  })),
  excluded_question_ids: z.array(uuid),
  answers: z.array(z.object({ question_id: uuid, choice_id: uuid.nullable(), text_answer: z.string().nullable() })),
  departures: z.array(departureSchema),
});

function toAnswering(value: z.infer<typeof answeringSchema>): StudentExamAnswering {
  const excluded = new Set(value.excluded_question_ids);
  return {
    accountId: value.account_id,
    serverNow: value.server_now,
    title: value.title,
    instructions: value.instructions,
    attempt: toAttemptState(value.attempt),
    editor: {
      generation: value.editor.generation, expiresAt: value.editor.expires_at,
      heartbeatSeconds: value.editor.heartbeat_seconds, leaseSeconds: value.editor.lease_seconds,
    },
    parts: value.parts.map((part) => ({
      id: part.id, title: part.title, instructions: part.instructions ?? "", kind: part.kind,
      questions: part.questions.map((question) => ({
        id: question.id, number: question.number, prompt: question.prompt, excluded: question.excluded || excluded.has(question.id),
        kind: part.kind, partId: part.id, choices: question.choices,
      })),
    })),
    excludedQuestionIds: value.excluded_question_ids,
    answers: Object.fromEntries(value.answers.map((answer) => [answer.question_id, { choiceId: answer.choice_id, text: answer.text_answer }])),
    departures: value.departures.map(toDeparture),
  };
}

const readSchema = z.discriminatedUnion("status", [z.object({ status: z.literal("state"), state: answeringSchema }), lostSchema, finalizedSchema]);

export function toStudentExamRead(value: unknown): StudentExamReadOutcome {
  const read = readSchema.parse(value);
  if (read.status === "lost") return { kind: "editor_lost", reason: read.reason };
  if (read.status === "finalized") return { kind: "finalized", state: toTerminal(read.state) };
  return { kind: "state", state: toAnswering(read.state) };
}

const heartbeatSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("renewed"), expires_at: timestamp, state: briefSchema }), lostSchema, finalizedSchema,
]);

export function toStudentExamHeartbeat(value: unknown): StudentExamHeartbeatOutcome {
  const beat = heartbeatSchema.parse(value);
  if (beat.status === "lost") return { kind: "editor_lost", reason: beat.reason };
  if (beat.status === "finalized") return { kind: "finalized", state: toTerminal(beat.state) };
  return { kind: "renewed", expiresAt: beat.expires_at, state: toBrief(beat.state) };
}

const releaseSchema = z.discriminatedUnion("status", [z.object({ status: z.literal("released") }), lostSchema, finalizedSchema]);

export function toStudentExamRelease(value: unknown): StudentExamReleaseOutcome {
  const release = releaseSchema.parse(value);
  if (release.status === "lost") return { kind: "editor_lost", reason: release.reason };
  if (release.status === "finalized") return { kind: "finalized", state: toTerminal(release.state) };
  return { kind: "released" };
}

const version = z.number().int().nonnegative();

/**
 * Save outcomes. A replayed receipt carries only its outcome and version; the state beside it is
 * freshly authorized (brief for the current editor, terminal after finalization, none otherwise).
 */
const saveSchema = z.union([
  z.object({ outcome: z.literal("saved"), answers_version: version, replayed: z.boolean(), state: briefSchema }),
  z.object({ outcome: z.literal("saved"), answers_version: version, replayed: z.literal(true), finalized: z.literal(true), state: terminalSchema }),
  z.object({ outcome: z.literal("saved"), answers_version: version, replayed: z.literal(true), editor: z.object({ status: z.literal("lost"), reason: lostReason }) }),
  z.object({ outcome: z.literal("conflict"), answers_version: version, state: briefSchema }),
  z.object({ outcome: z.literal("finalized"), state: terminalSchema }),
  z.object({ outcome: z.literal("editor_lost"), reason: lostReason }),
]);

export function toStudentExamSave(value: unknown): StudentExamSaveOutcome {
  const save = saveSchema.parse(value);
  if (save.outcome === "editor_lost") return { kind: "editor_lost", reason: save.reason, acknowledgedVersion: null };
  if (save.outcome === "finalized") return { kind: "finalized", state: toTerminal(save.state), acknowledged: false };
  if (save.outcome === "conflict") return { kind: "conflict", answersVersion: save.answers_version, state: toBrief(save.state) };
  if ("editor" in save) return { kind: "editor_lost", reason: save.editor.reason, acknowledgedVersion: save.answers_version };
  if ("finalized" in save) return { kind: "finalized", state: toTerminal(save.state), acknowledged: true };
  return { kind: "saved", answersVersion: save.answers_version, replayed: save.replayed, state: toBrief(save.state) };
}

const submitSchema = z.union([
  z.object({ outcome: z.enum(["submitted", "finalized", "source_conflict"]), replayed: z.boolean(), state: terminalSchema }),
  z.object({ outcome: z.literal("conflict"), answers_version: version, state: briefSchema }),
  z.object({ outcome: z.literal("editor_lost"), reason: lostReason }),
]);

export function toStudentExamSubmit(value: unknown): StudentExamSubmitOutcome {
  const submit = submitSchema.parse(value);
  if (submit.outcome === "editor_lost") return { kind: "editor_lost", reason: submit.reason };
  if (submit.outcome === "conflict") return { kind: "conflict", answersVersion: submit.answers_version, state: toBrief(submit.state) };
  const state = toTerminal(submit.state);
  if (submit.outcome === "submitted") return { kind: "submitted", replayed: submit.replayed, state };
  return { kind: submit.outcome === "source_conflict" ? "source_conflict" : "finalized", replayed: submit.replayed, state };
}

const departureOutcomeSchema = z.union([
  z.object({ outcome: z.literal("editor_lost"), reason: lostReason }),
  z.object({
    outcome: z.enum(["warned", "duplicate", "kicked", "finalized"]),
    departure: departureSchema.nullable(),
    state: z.record(z.string(), z.unknown()),
  }),
]);

/** The database returns the terminal state once the attempt has ended, and the brief state otherwise. */
export function toStudentExamDeparture(value: unknown): StudentExamDepartureOutcome {
  const result = departureOutcomeSchema.parse(value);
  if (result.outcome === "editor_lost") return { kind: "editor_lost", reason: result.reason };
  const departure = result.departure && toDeparture(result.departure);
  if ("submission" in result.state) {
    return { kind: result.outcome === "kicked" ? "kicked" : "finalized", departure, state: toTerminal(terminalSchema.parse(result.state)) };
  }
  if (result.outcome !== "warned" && result.outcome !== "duplicate") throw new Error("Unexpected departure outcome");
  return { kind: result.outcome === "warned" ? "warned" : "duplicate", departure, state: toBrief(briefSchema.parse(result.state)) };
}

const imagesSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), academy_id: uuid, image_ids: z.array(uuid) }),
  z.object({ status: z.literal("lost") }),
  z.object({ status: z.literal("finalized") }),
]);

export type StudentExamImageAuthorization = { kind: "ok"; academyId: string; imageIds: string[] } | { kind: "editor_lost" } | { kind: "finalized" };

export function toStudentExamImageAuthorization(value: unknown): StudentExamImageAuthorization {
  const result = imagesSchema.parse(value);
  if (result.status === "ok") return { kind: "ok", academyId: result.academy_id, imageIds: result.image_ids };
  return result.status === "lost" ? { kind: "editor_lost" } : { kind: "finalized" };
}
