import type { NextRequest } from "next/server";

import { withStaffApi } from "@/lib/api/handler";
import { preflight } from "@/lib/api/http";
import { liveSessionsResponse, startSessionResponse } from "@/modules/sessions/server";

const METHODS = "GET, POST, OPTIONS";

/** GET /api/v1/academies/{academyId}/sessions?state=live — live sessions, newest first, paginated. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ academyId: string }> }) {
  const { academyId } = await params;
  return withStaffApi(request, METHODS, "read", (context) => liveSessionsResponse(context, academyId, request.nextUrl.searchParams));
}

/** POST /api/v1/academies/{academyId}/sessions — start a schedule's session, or open its live one. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ academyId: string }> }) {
  const { academyId } = await params;
  return withStaffApi(request, METHODS, "write", (context) => startSessionResponse(context, request, academyId));
}

export function OPTIONS(request: Request) {
  return preflight(request, METHODS);
}
