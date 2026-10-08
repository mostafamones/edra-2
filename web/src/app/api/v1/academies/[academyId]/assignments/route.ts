import type { NextRequest } from "next/server";

import { withStaffApi } from "@/lib/api/handler";
import { preflight } from "@/lib/api/http";
import { assignmentsResponse } from "@/modules/assignments/server";

const METHODS = "GET, OPTIONS";

/** GET /api/v1/academies/{academyId}/assignments?state=&limit=&offset= — assignments, newest first, paginated. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ academyId: string }> }) {
  const { academyId } = await params;
  return withStaffApi(request, METHODS, "read", (context) => assignmentsResponse(context, academyId, request.nextUrl.searchParams));
}

export function OPTIONS(request: Request) {
  return preflight(request, METHODS);
}
