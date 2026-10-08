import { withStaffApi } from "@/lib/api/handler";
import { preflight } from "@/lib/api/http";
import { assignmentResponse, withAssignmentAcademy } from "@/modules/assignments/server";

const METHODS = "GET, OPTIONS";

/** GET /api/v1/assignments/{assignmentId} — structure, parts, audience, state, and version. */
export async function GET(request: Request, { params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  return withStaffApi(request, METHODS, "read", (context) =>
    withAssignmentAcademy(context, assignmentId, (academyId) => assignmentResponse(context, academyId, assignmentId)));
}

export function OPTIONS(request: Request) {
  return preflight(request, METHODS);
}
