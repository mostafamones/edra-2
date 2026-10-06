import type { NextRequest } from "next/server";

import { withStaffApi } from "@/lib/api/handler";
import { preflight } from "@/lib/api/http";
import { liveSessionsResponse } from "@/modules/sessions/server";

const METHODS = "GET, OPTIONS";

/** GET /api/v1/academies/{academyId}/sessions?state=live — live sessions, newest first, paginated. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ academyId: string }> }) {
  const { academyId } = await params;
  return withStaffApi(request, METHODS, "read", (context) => liveSessionsResponse(context, academyId, request.nextUrl.searchParams));
}

export function OPTIONS(request: Request) {
  return preflight(request, METHODS);
}
