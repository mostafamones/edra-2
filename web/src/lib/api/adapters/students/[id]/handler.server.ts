import "@tanstack/react-start/server-only";

import { getStudentRecord } from "@/modules/students/server";

/** GET /api/students/<id>?academy=<id> — one staff student record, fresh for editing. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const academyId = new URL(request.url).searchParams.get("academy") ?? "";
  const result = await getStudentRecord(academyId, id);
  if (!result.ok) return Response.json({ error: "unavailable" }, { status: result.status });
  return Response.json(result.data, { headers: { "Cache-Control": "private, no-store" } });
}
