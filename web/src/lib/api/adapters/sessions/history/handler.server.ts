import "@tanstack/react-start/server-only";

import { listSessionHistory, readSessionHistoryQuery } from "@/modules/sessions/server";

/**
 * GET /api/sessions/history?academy=<id>&q=…&archive=…&cursor=…&limit=… — ended and auto-closed
 * sessions, newest first, optionally searched by schedule, group, level, program, or who started
 * them. `archive` is active (default, unarchived), archived, or all.
 */
export async function GET(request: Request) {
  const query = readSessionHistoryQuery(new URL(request.url).searchParams);
  if (!query) return Response.json({ error: "invalid_parameters" }, { status: 400 });
  const result = await listSessionHistory(query);
  if (!result.ok) return Response.json({ error: "unavailable" }, { status: result.status });
  return Response.json(result.data, { headers: { "Cache-Control": "private, no-store" } });
}
