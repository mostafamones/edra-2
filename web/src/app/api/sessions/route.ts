import type { NextRequest } from "next/server";

import { listLiveSessions, readLiveSessionQuery } from "@/modules/sessions/server";

/**
 * GET /api/sessions?academy=<id>&cursor=…&limit=… — live sessions, newest first. Without `academy`,
 * lists every academy the signed-in staff member belongs to.
 */
export async function GET(request: NextRequest) {
  const query = readLiveSessionQuery(request.nextUrl.searchParams);
  if (!query) return Response.json({ error: "invalid_parameters" }, { status: 400 });
  const result = await listLiveSessions(query);
  if (!result.ok) return Response.json({ error: "unavailable" }, { status: result.status });
  return Response.json(result.data, { headers: { "Cache-Control": "private, no-store" } });
}
