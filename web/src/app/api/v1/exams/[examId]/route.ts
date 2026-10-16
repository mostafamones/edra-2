import { withStaffApi } from "@/lib/api/handler";
import { preflight } from "@/lib/api/http";
import { examResponse, withExamAcademy } from "@/modules/exams/server";

const METHODS = "GET, OPTIONS";

/** GET /api/v1/exams/{examId} — preparation, window, phase, key and correction history (staff). */
export async function GET(request: Request, { params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params;
  return withStaffApi(request, METHODS, "read", (context) =>
    withExamAcademy(context, examId, (academyId) => examResponse(context, academyId, examId)));
}

export function OPTIONS(request: Request) {
  return preflight(request, METHODS);
}
