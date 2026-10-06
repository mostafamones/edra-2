import type { NextRequest } from "next/server";

import { getSession } from "@/modules/sessions/server";

/** GET /api/sessions/<id>?academy=<id> — one session with its historical roster. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const academyId = request.nextUrl.searchParams.get("academy") ?? "";
  const result = await getSession(academyId, id);
  if (!result.ok) return Response.json({ error: "unavailable" }, { status: result.status });
  return Response.json(result.data, { headers: { "Cache-Control": "private, no-store" } });
}
