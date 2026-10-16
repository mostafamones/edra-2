import { withStaffApi } from "@/lib/api/handler";
import { preflight } from "@/lib/api/http";
import { examStudentsResponse, withExamAcademy } from "@/modules/exams/server";

const METHODS = "GET, OPTIONS";

/** GET /api/v1/exams/{examId}/students — eligible and historical students with work and result state. */
export async function GET(request: Request, { params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params;
  return withStaffApi(request, METHODS, "read", (context) =>
    withExamAcademy(context, examId, (academyId) => examStudentsResponse(context, academyId, examId)));
}

export function OPTIONS(request: Request) {
  return preflight(request, METHODS);
}
