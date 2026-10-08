import { withStaffApi } from "@/lib/api/handler";
import { preflight } from "@/lib/api/http";
import { resolutionResponse, withAssignmentAcademy } from "@/modules/assignments/server";

const METHODS = "POST, OPTIONS";

/** POST /api/v1/assignments/{assignmentId}/student-resolution — identify a recipient from a student code (read-only). */
export async function POST(request: Request, { params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  return withStaffApi(request, METHODS, "read", (context) =>
    withAssignmentAcademy(context, assignmentId, (academyId) => resolutionResponse(context, request, academyId, assignmentId)));
}

export function OPTIONS(request: Request) {
  return preflight(request, METHODS);
}
