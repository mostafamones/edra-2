import "@tanstack/react-start/server-only";

import { cookieAuthority, type Db } from "@/lib/supabase/authority";
import { concernFailure, concernFailureFromDatabase, type ConcernFailure } from "./errors";

/** Runs a concern command as the signed-in caller; the database rechecks live access and participation. */
export async function runConcernCommand<T>(
  run: (db: Db) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>,
  map: (data: unknown) => T,
): Promise<T | ConcernFailure> {
  try {
    const caller = await cookieAuthority();
    if (!caller) return concernFailure("forbidden");
    const { data, error } = await run(caller.db);
    return error ? concernFailureFromDatabase(error) : map(data);
  } catch {
    return concernFailure("unavailable");
  }
}
