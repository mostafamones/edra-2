import { withStaffApi } from "@/lib/api/handler";
import { preflight } from "@/lib/api/http";
import { addAttendeeResponse, attendeeSearchResponse } from "@/modules/attendance/server";
import { withSessionAcademy } from "@/modules/sessions/server";

const METHODS = "GET, POST, OPTIONS";

/** GET /api/v1/sessions/{sessionId}/attendance/attendees — candidates for an unexpected attendee. */
export async function GET(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return withStaffApi(request, METHODS, "read", (context) =>
    withSessionAcademy(context, sessionId, (academyId) => attendeeSearchResponse(context, request, academyId, sessionId)));
}

/** POST /api/v1/sessions/{sessionId}/attendance/attendees — explicitly append an unexpected attendee. */
export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return withStaffApi(request, METHODS, "write", (context) =>
    withSessionAcademy(context, sessionId, (academyId) => addAttendeeResponse(context, request, academyId, sessionId)));
}

export function OPTIONS(request: Request) {
  return preflight(request, METHODS);
}
