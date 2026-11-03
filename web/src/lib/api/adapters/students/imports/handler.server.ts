import "@tanstack/react-start/server-only";

import { findUnfinishedImport } from "@/modules/students/server";

/** GET /api/students/imports?academy=<id> — the caller's latest unfinished import in the academy, or null. */
export async function GET(request: Request) {
  const academyId = new URL(request.url).searchParams.get("academy") ?? "";
  const result = await findUnfinishedImport(academyId);
  if (!result.ok) return Response.json({ error: "unavailable" }, { status: result.status });
  return Response.json({ session: result.data }, { headers: { "Cache-Control": "private, no-store" } });
}
