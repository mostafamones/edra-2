import { withStaffApi } from "@/lib/api/handler";
import { preflight } from "@/lib/api/http";
import { quizStudentsResponse, withQuizAcademy } from "@/modules/quizzes/server";

const METHODS = "GET, OPTIONS";

/** GET /api/v1/quizzes/{quizId}/students — eligible and historical students with work and result state. */
export async function GET(request: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
  return withStaffApi(request, METHODS, "read", (context) =>
    withQuizAcademy(context, quizId, (academyId) => quizStudentsResponse(context, academyId, quizId)));
}

export function OPTIONS(request: Request) {
  return preflight(request, METHODS);
}
