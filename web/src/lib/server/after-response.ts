import "@tanstack/react-start/server-only";
import { waitUntil } from "cloudflare:workers";

/**
 * Runs trusted follow-up work after a successful request without delaying or failing it. Errors are
 * swallowed: the scheduled Cron Trigger retries anything this misses.
 */
export function afterResponse(task: () => Promise<unknown>) {
  try { waitUntil(task().catch(() => undefined)); } catch { /* Outside a Worker invocation. */ }
}
