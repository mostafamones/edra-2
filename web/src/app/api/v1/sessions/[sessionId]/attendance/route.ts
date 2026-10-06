import { withStaffApi } from "@/lib/api/handler";
import { preflight } from "@/lib/api/http";
import { attendanceResponse } from "@/modules/attendance/server";
import { withSessionAcademy } from "@/modules/sessions/server";

const METHODS = "GET, OPTIONS";

/** GET /api/v1/sessions/{sessionId}/attendance — versioned roster with draft and official values. */
export async function GET(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return withStaffApi(request, METHODS, "read", (context) =>
    withSessionAcademy(context, sessionId, (academyId) => attendanceResponse(context, academyId, sessionId)));
}

export function OPTIONS(request: Request) {
  return preflight(request, METHODS);
}
