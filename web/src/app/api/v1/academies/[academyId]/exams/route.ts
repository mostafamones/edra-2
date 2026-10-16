import type { NextRequest } from "next/server";

import { withStaffApi } from "@/lib/api/handler";
import { preflight } from "@/lib/api/http";
import { examsResponse } from "@/modules/exams/server";

const METHODS = "GET, OPTIONS";

/** GET /api/v1/academies/{academyId}/exams — exams with derived phase, newest first, paginated. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ academyId: string }> }) {
  const { academyId } = await params;
  return withStaffApi(request, METHODS, "read", (context) => examsResponse(context, academyId, request.nextUrl.searchParams));
}

export function OPTIONS(request: Request) {
  return preflight(request, METHODS);
}
