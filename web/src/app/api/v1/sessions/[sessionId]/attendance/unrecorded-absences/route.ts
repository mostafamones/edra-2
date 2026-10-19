import { withStaffApi } from "@/lib/api/handler";
import { preflight } from "@/lib/api/http";
import { unrecordedAbsenceResponse } from "@/modules/attendance/server";
import { withSessionAcademy } from "@/modules/sessions/server";

const METHODS = "POST, OPTIONS";

/** POST /api/v1/sessions/{sessionId}/attendance/unrecorded-absences — reviewed all-remaining absence. */
export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return withStaffApi(request, METHODS, "write", (context) =>
    withSessionAcademy(context, sessionId, (academyId) => unrecordedAbsenceResponse(context, request, academyId, sessionId)));
}

export function OPTIONS(request: Request) {
  return preflight(request, METHODS);
}
