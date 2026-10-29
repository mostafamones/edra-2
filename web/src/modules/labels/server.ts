import "server-only";

import { cookieAuthority, type Db } from "@/lib/supabase/authority";
import { labelFailure, labelFailureFromDatabase } from "./errors";
import type { LabelFailure } from "./types";

/**
 * Runs a label command as the signed-in caller. The database re-checks live membership, suspension,
 * role and tenant for every command, so no separate membership read is made here.
 */
export async function runLabelCommand<T>(
  run: (db: Db) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>,
  map: (data: unknown) => T,
): Promise<T | LabelFailure> {
  try {
    const caller = await cookieAuthority();
    if (!caller) return labelFailure("forbidden");
    const { data, error } = await run(caller.db);
    return error ? labelFailureFromDatabase(error) : map(data);
  } catch {
    return labelFailure("unavailable");
  }
}
export { labelFailure } from "./errors";
export type { LabelFailure } from "./types";
