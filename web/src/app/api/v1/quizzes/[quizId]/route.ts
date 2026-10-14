import { withStaffApi } from "@/lib/api/handler";
import { preflight } from "@/lib/api/http";
import { quizResponse, withQuizAcademy } from "@/modules/quizzes/server";

const METHODS = "GET, OPTIONS";

/** GET /api/v1/quizzes/{quizId} — preparation, window, phase, key and correction history (staff). */
export async function GET(request: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
  return withStaffApi(request, METHODS, "read", (context) =>
    withQuizAcademy(context, quizId, (academyId) => quizResponse(context, academyId, quizId)));
}

export function OPTIONS(request: Request) {
  return preflight(request, METHODS);
}
