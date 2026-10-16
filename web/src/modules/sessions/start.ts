import "server-only";

import { z } from "zod";

import type { Authority } from "@/lib/supabase/authority";
import { sessionActor } from "./data";
import { failure, failureFromDatabase } from "./errors";
import type { StartOutcome, StartResult } from "./types";

const startSchema = z.object({ academyId: z.uuid(), scheduleId: z.uuid(), startKey: z.uuid() });

/**
 * Starts a live session from a schedule at any time, or opens the schedule's existing live
 * session. Retrying with the same `startKey` returns the same session. Shared by the cookie web
 * action and the bearer API: pass the caller's `authority`, or omit it for the request's cookie
 * session. Membership, schedule, year and idempotency are re-checked by `start_session`.
 */
export async function runStartSession(value: unknown, authority?: Authority | null): Promise<StartResult> {
  const parsed = startSchema.safeParse(value);
  if (!parsed.success) return failure("validation");
  const { academyId, scheduleId, startKey } = parsed.data;
  const actor = await sessionActor(academyId, authority);
  if (!actor) return failure("forbidden");
  try {
    const { data, error } = await actor.db.rpc("start_session", {
      p_academy_id: academyId, p_schedule_id: scheduleId, p_start_key: startKey,
    });
    if (error) return failureFromDatabase(error);
    const row = data?.[0];
    if (!row) return failure("unavailable");
    const outcome = row.outcome as StartOutcome;
    if (outcome !== "replayed") return { ok: true, sessionId: row.session_id, outcome };
    // A retried start returns its original session even if that session was archived since.
    const { data: original } = await actor.db.from("sessions").select("archived_at").eq("id", row.session_id).maybeSingle();
    return { ok: true, sessionId: row.session_id, outcome, archived: Boolean(original?.archived_at) };
  } catch {
    return failure("unavailable");
  }
}
