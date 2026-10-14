import type { NextRequest } from "next/server";

import { withStaffApi } from "@/lib/api/handler";
import { preflight } from "@/lib/api/http";
import { quizzesResponse } from "@/modules/quizzes/server";

const METHODS = "GET, OPTIONS";

/** GET /api/v1/academies/{academyId}/quizzes — quizzes with derived phase, newest first, paginated. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ academyId: string }> }) {
  const { academyId } = await params;
  return withStaffApi(request, METHODS, "read", (context) => quizzesResponse(context, academyId, request.nextUrl.searchParams));
}

export function OPTIONS(request: Request) {
  return preflight(request, METHODS);
}
