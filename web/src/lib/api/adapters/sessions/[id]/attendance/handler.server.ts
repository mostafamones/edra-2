import "@tanstack/react-start/server-only";

import { getAttendance } from "@/modules/attendance/server";

/** GET /api/sessions/<id>/attendance?academy=<id> — the staff web view of a session's attendance. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const academyId = new URL(request.url).searchParams.get("academy") ?? "";
  const result = await getAttendance(academyId, id);
  if (!result.ok) return Response.json({ error: "unavailable" }, { status: result.status });
  return Response.json(result.data, { headers: { "Cache-Control": "private, no-store" } });
}
