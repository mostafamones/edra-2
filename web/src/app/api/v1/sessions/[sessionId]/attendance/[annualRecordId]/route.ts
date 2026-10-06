import { withStaffApi } from "@/lib/api/handler";
import { preflight } from "@/lib/api/http";
import { patchResponse } from "@/modules/attendance/server";
import { withSessionAcademy } from "@/modules/sessions/server";

const METHODS = "PATCH, OPTIONS";

/** PATCH /api/v1/sessions/{sessionId}/attendance/{annualRecordId} — versioned manual draft change. */
export async function PATCH(request: Request, { params }: { params: Promise<{ sessionId: string; annualRecordId: string }> }) {
  const { sessionId, annualRecordId } = await params;
  return withStaffApi(request, METHODS, "write", (context) =>
    withSessionAcademy(context, sessionId, (academyId) => patchResponse(context, request, academyId, sessionId, annualRecordId)));
}

export function OPTIONS(request: Request) {
  return preflight(request, METHODS);
}
