import "@tanstack/react-start/server-only";

import { withStaffApi } from "@/lib/api/handler";
import { preflight } from "@/lib/api/http";
import { quizzesResponse } from "@/modules/quizzes/server";

const METHODS = "GET, OPTIONS";

/** GET /api/v1/academies/{academyId}/quizzes — quizzes with derived phase, newest first, paginated. */
export async function GET(request: Request, { params }: { params: Promise<{ academyId: string }> }) {
  const { academyId } = await params;
  return withStaffApi(request, METHODS, "read", (context) => quizzesResponse(context, academyId, new URL(request.url).searchParams));
}

export function OPTIONS(request: Request) {
  return preflight(request, METHODS);
}
