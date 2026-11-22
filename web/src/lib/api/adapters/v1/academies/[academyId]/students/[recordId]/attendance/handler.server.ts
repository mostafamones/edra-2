import "@tanstack/react-start/server-only";

import { withStaffApi } from "@/lib/api/handler";
import { preflight } from "@/lib/api/http";
import { studentAttendanceResponse } from "@/modules/students/server";

const METHODS = "GET, OPTIONS";

/** GET /api/v1/academies/{academyId}/students/{recordId}/attendance?limit=&offset= — finalized attendance. */
export async function GET(request: Request, { params }: { params: Promise<{ academyId: string; recordId: string }> }) {
  const { academyId, recordId } = await params;
  return withStaffApi(request, METHODS, "read", (context) => studentAttendanceResponse(context, academyId, recordId, new URL(request.url).searchParams));
}

export function OPTIONS(request: Request) {
  return preflight(request, METHODS);
}
