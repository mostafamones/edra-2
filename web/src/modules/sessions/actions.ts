"use server";

import { z } from "zod";

import { sessionActor } from "./data";
import { failure, failureFromDatabase } from "./errors";
import { runStartSession } from "./start";
import type { ArchiveResult, EndResult, StartResult } from "./types";

const endSchema = z.object({ academyId: z.guid(), sessionId: z.guid() });
const archiveSchema = z.object({
  academyId: z.guid(), sessionId: z.guid(), expectedVersion: z.number().int().min(1), idempotencyKey: z.guid(),
  note: z.string().trim().max(500).optional(),
});
const restoreSchema = archiveSchema.omit({ note: true });
const archiveResponseSchema = z.object({
  outcome: z.enum(["archived", "already_archived", "restored", "not_archived", "conflict"]),
  session: z.object({
    id: z.string(),
    metadata_version: z.number().int(),
    state: z.enum(["live", "ended"]),
    ended_at: z.string().nullable(),
    end_reason: z.enum(["manual", "auto"]).nullable(),
    archived_at: z.string().nullable(),
    archived_by_name: z.string().nullable(),
    archive_note: z.string().nullable(),
  }),
  ended_live: z.boolean().optional(),
  stopped_effects: z.number().int(),
  replayed: z.boolean(),
});

/**
 * Starts a live session from a schedule at any time, or opens the schedule's existing live
 * session. Retrying with the same `startKey` returns the same session.
 */
export async function startSession(value: unknown): Promise<StartResult> {
  return runStartSession(value);
}

/** Ends a live session. It leaves the live list; its details and roster stay as history. */
export async function endSession(value: unknown): Promise<EndResult> {
  const parsed = endSchema.safeParse(value);
  if (!parsed.success) return failure("validation");
  const { academyId, sessionId } = parsed.data;
  const actor = await sessionActor(academyId);
  if (!actor) return failure("forbidden");
  try {
    const { data, error } = await actor.db.rpc("end_session", { p_academy_id: academyId, p_session_id: sessionId });
    if (error) return failureFromDatabase(error);
    return { ok: true, outcome: data === "already_ended" ? "already_ended" : "ended" };
  } catch {
    return failure("unavailable");
  }
}

async function changeArchive(action: "archive" | "restore", value: unknown): Promise<ArchiveResult> {
  const parsed = (action === "archive" ? archiveSchema : restoreSchema).safeParse(value);
  if (!parsed.success) return failure("validation");
  const { academyId, sessionId, expectedVersion, idempotencyKey } = parsed.data;
  const note = "note" in parsed.data ? (parsed.data.note as string | undefined) || undefined : undefined;
  const actor = await sessionActor(academyId);
  if (!actor) return failure("forbidden");
  try {
    const { data, error } = action === "archive"
      ? await actor.db.rpc("archive_session", {
        p_academy_id: academyId, p_session_id: sessionId, p_expected_version: expectedVersion, p_key: idempotencyKey, p_note: note,
      })
      : await actor.db.rpc("restore_session", {
        p_academy_id: academyId, p_session_id: sessionId, p_expected_version: expectedVersion, p_key: idempotencyKey,
      });
    if (error) return failureFromDatabase(error);
    const result = archiveResponseSchema.parse(data);
    return {
      ok: true,
      outcome: result.outcome,
      session: {
        id: result.session.id,
        metadataVersion: result.session.metadata_version,
        state: result.session.state,
        endedAt: result.session.ended_at,
        endReason: result.session.end_reason,
        sessionArchivedAt: result.session.archived_at,
        sessionArchivedByName: result.session.archived_by_name,
        archiveNote: result.session.archive_note,
      },
      endedLive: result.ended_live ?? false,
      stoppedEffects: result.stopped_effects,
      replayed: result.replayed,
    };
  } catch {
    return failure("unavailable");
  }
}

/**
 * Archives a session (Owner, Head Admin or Admin; open year only). A live session is ended and
 * archived together. Nothing is deleted; the session stops counting and becomes read-only. Reuse
 * `idempotencyKey` when retrying an uncertain request.
 */
export async function archiveSession(value: unknown): Promise<ArchiveResult> {
  return changeArchive("archive", value);
}

/** Restores an archived session: it counts again and stays ended. Same roles and retry rules as archiving. */
export async function restoreSession(value: unknown): Promise<ArchiveResult> {
  return changeArchive("restore", value);
}
