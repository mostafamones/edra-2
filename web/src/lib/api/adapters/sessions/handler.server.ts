import "@tanstack/react-start/server-only";

import { listLiveSessions, readLiveSessionQuery } from "@/modules/sessions/server";

/**
 * GET /api/sessions?academy=<id>&cursor=…&limit=… — live sessions, newest first. Without `academy`,
 * lists every academy the signed-in staff member belongs to.
 */
export async function GET(request: Request) {
  const query = readLiveSessionQuery(new URL(request.url).searchParams);
  if (!query) return Response.json({ error: "invalid_parameters" }, { status: 400 });
  const result = await listLiveSessions(query);
  if (!result.ok) return Response.json({ error: "unavailable" }, { status: result.status });
  return Response.json(result.data, { headers: { "Cache-Control": "private, no-store" } });
}
