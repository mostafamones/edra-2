import { withStaffApi } from "@/lib/api/handler";
import { preflight } from "@/lib/api/http";
import { publicationResponse, withAssignmentAcademy } from "@/modules/assignments/server";

const METHODS = "POST, OPTIONS";

/** POST /api/v1/assignments/{assignmentId}/results/publications — announce selected complete results (Idempotency-Key required). */
export async function POST(request: Request, { params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  return withStaffApi(request, METHODS, "write", (context) =>
    withAssignmentAcademy(context, assignmentId, (academyId) => publicationResponse(context, request, academyId, assignmentId)));
}

export function OPTIONS(request: Request) {
  return preflight(request, METHODS);
}
