"use server";

import { z } from "zod";

import { sessionActor } from "./data";
import { failure, failureFromDatabase } from "./errors";
import type { DeleteResult, EndResult, StartOutcome, StartResult } from "./types";

const startSchema = z.object({ academyId: z.uuid(), scheduleId: z.uuid(), startKey: z.uuid() });
const endSchema = z.object({ academyId: z.uuid(), sessionId: z.uuid() });

/**
 * Starts a live session from a schedule at any time, or opens the schedule's existing live
 * session. Retrying with the same `startKey` returns the same session.
 */
export async function startSession(value: unknown): Promise<StartResult> {
  const parsed = startSchema.safeParse(value);
  if (!parsed.success) return failure("validation");
  const { academyId, scheduleId, startKey } = parsed.data;
  const actor = await sessionActor(academyId);
  if (!actor) return failure("forbidden");
  try {
    const { data, error } = await actor.db.rpc("start_session", {
      p_academy_id: academyId, p_schedule_id: scheduleId, p_start_key: startKey,
    });
    if (error) return failureFromDatabase(error);
    const row = data?.[0];
    if (!row) return failure("unavailable");
    return { ok: true, sessionId: row.session_id, outcome: row.outcome as StartOutcome };
  } catch {
    return failure("unavailable");
  }
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

/** Deletes an ended session whose attendance was never published. Owners and admins only. */
export async function deleteSession(value: unknown): Promise<DeleteResult> {
  const parsed = endSchema.safeParse(value);
  if (!parsed.success) return failure("validation");
  const { academyId, sessionId } = parsed.data;
  const actor = await sessionActor(academyId);
  if (!actor) return failure("forbidden");
  try {
    const { error } = await actor.db.rpc("delete_session", { p_academy_id: academyId, p_session_id: sessionId });
    if (error) return failureFromDatabase(error);
    return { ok: true };
  } catch {
    return failure("unavailable");
  }
}
