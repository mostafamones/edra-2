import "@tanstack/react-start/server-only";

import { afterResponse } from "@/lib/server/after-response";
import { cookieAuthority, type Db } from "@/lib/supabase/authority";
import { concernFailure, concernFailureFromDatabase, type ConcernFailure } from "./errors";

/**
 * Runs a concern command as the signed-in caller; the database rechecks live access and participation.
 * `notify`: the command can queue notifications, so dispatch runs after the response.
 */
export async function runConcernCommand<T>(
  run: (db: Db) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>,
  map: (data: unknown) => T,
  notify = false,
): Promise<T | ConcernFailure> {
  try {
    const caller = await cookieAuthority();
    if (!caller) return concernFailure("forbidden");
    const { data, error } = await run(caller.db);
    if (error) return concernFailureFromDatabase(error);
    // Notifications were queued in the same transaction; push them now (the Cron Trigger retries).
    if (notify) afterResponse(() => import("@/modules/notifications/server").then((notifications) => notifications.runNotificationDispatch()));
    return map(data);
  } catch {
    return concernFailure("unavailable");
  }
}
