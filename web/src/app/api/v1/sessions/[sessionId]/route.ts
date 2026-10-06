import { withStaffApi } from "@/lib/api/handler";
import { apiJson, preflight, snakeKeys } from "@/lib/api/http";
import { getAttendance } from "@/modules/attendance/server";
import { getSession, readStatusError, sessionV1, withSessionAcademy } from "@/modules/sessions/server";

const METHODS = "GET, OPTIONS";

/** GET /api/v1/sessions/{sessionId} — session snapshot, lifecycle, and what the caller may do now. */
export async function GET(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return withStaffApi(request, METHODS, "read", (context) => withSessionAcademy(context, sessionId, async (academyId) => {
    const [session, attendance] = await Promise.all([
      getSession(academyId, sessionId, context.authority),
      getAttendance(academyId, sessionId, context.authority),
    ]);
    if (!session.ok) return readStatusError(context, session.status);
    if (!attendance.ok) return readStatusError(context, attendance.status);
    return apiJson(context, {
      session: sessionV1(session.data),
      year_open: attendance.data.session.yearOpen,
      permitted_actions: snakeKeys(attendance.data.permittedActions),
    });
  }));
}

export function OPTIONS(request: Request) {
  return preflight(request, METHODS);
}
