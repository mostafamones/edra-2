import "@tanstack/react-start/server-only";

import type { Db } from "@/lib/supabase/authority";

/** Public server API for other modules and the Worker entry. */
export { runNotificationDispatch } from "./dispatch.server";

/** Global sign-out: the caller's browsers stop receiving push. Best effort; never blocks sign-out. */
export async function forgetPushSubscriptions(db: Pick<Db, "rpc">) {
  try { await db.rpc("forget_push_subscriptions"); } catch { /* Sign-out must still complete. */ }
}
