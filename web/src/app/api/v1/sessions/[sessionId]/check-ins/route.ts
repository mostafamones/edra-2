import { withStaffApi } from "@/lib/api/handler";
import { preflight } from "@/lib/api/http";
import { checkInResponse } from "@/modules/attendance/server";
import { withSessionAcademy } from "@/modules/sessions/server";

const METHODS = "POST, OPTIONS";

/** POST /api/v1/sessions/{sessionId}/check-ins — positive check-in (draft Present) while live. */
export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return withStaffApi(request, METHODS, "write", (context) =>
    withSessionAcademy(context, sessionId, (academyId) => checkInResponse(context, request, academyId, sessionId)));
}

export function OPTIONS(request: Request) {
  return preflight(request, METHODS);
}
