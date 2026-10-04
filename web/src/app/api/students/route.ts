import type { NextRequest } from "next/server";

import { listStudentRecords, readListParams } from "@/modules/students/server";

/** GET /api/students?academy=<id>&q=…&status=…&sort=…&page=…&size=… — one page of staff student records. */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const academyId = query.get("academy") ?? "";
  const { params, valid } = readListParams(query);
  if (!valid) return Response.json({ error: "invalid_parameters" }, { status: 400 });
  const result = await listStudentRecords(academyId, params);
  if (!result.ok) return Response.json({ error: "unavailable" }, { status: result.status });
  return Response.json(result.data, { headers: { "Cache-Control": "private, no-store" } });
}
