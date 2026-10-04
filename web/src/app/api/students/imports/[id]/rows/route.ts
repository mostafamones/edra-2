import type { NextRequest } from "next/server";

import { listImportRows, readImportRowParams } from "@/modules/students/server";

/** GET /api/students/imports/<id>/rows?academy=<id>&status=…&q=…&page=…&size=… — one page of an import's rows. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const query = request.nextUrl.searchParams;
  const rowParams = readImportRowParams(query);
  if (!rowParams) return Response.json({ error: "invalid_parameters" }, { status: 400 });
  const result = await listImportRows(query.get("academy") ?? "", id, rowParams);
  if (!result.ok) return Response.json({ error: "unavailable" }, { status: result.status });
  return Response.json(result.data, { headers: { "Cache-Control": "private, no-store" } });
}
