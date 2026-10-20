import { z } from "zod";

import { EXAM_PHASES, EXAM_SOURCES, FINALIZATION_REASONS } from "../types";
import { STUDENT_EXAM_ACTIONS, type StudentExamOverview, type StudentExamPage, type StudentExamStart } from "./types";

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

/** Only the attempt is read from the engine's student state; question material is never forwarded. */
const startSchema = z.object({ attempt: attemptSchema });

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

export function toStudentExamStart(value: unknown): StudentExamStart {
  const attempt = toAttempt(startSchema.parse(value).attempt);
  return { attempt, active: attempt.finalizedAt === null && !attempt.superseded };
}
