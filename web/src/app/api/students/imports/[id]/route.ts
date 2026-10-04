import type { NextRequest } from "next/server";

import { getImportSummary } from "@/modules/students/server";

/** GET /api/students/imports/<id>?academy=<id> — an import session with its review and execution counts. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const academyId = request.nextUrl.searchParams.get("academy") ?? "";
  const result = await getImportSummary(academyId, id);
  if (!result.ok) return Response.json({ error: "unavailable" }, { status: result.status });
  return Response.json(result.data, { headers: { "Cache-Control": "private, no-store" } });
}
