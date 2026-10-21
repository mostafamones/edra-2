// Read-only view of a registered run: its registry row and the verification counts. Never writes.
import { verificationReport } from "./verify.mjs";
import { runRowSql } from "./registry.mjs";

/** Returns {run, counts}; run is null when the run is not registered. */
export async function inspectRun(ctx) {
  const rows = await ctx.runSql(runRowSql(ctx.runId));
  const run = rows[0]?.result ?? null;
  const counts = (await verificationReport(ctx.runSql, ctx.runId))?.counts ?? null;
  return { run, counts };
}
