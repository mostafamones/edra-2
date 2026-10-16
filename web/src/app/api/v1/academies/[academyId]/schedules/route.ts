import type { NextRequest } from "next/server";

import { withStaffApi } from "@/lib/api/handler";
import { preflight } from "@/lib/api/http";
import { schedulesResponse } from "@/modules/schedules/server";

const METHODS = "GET, OPTIONS";

/** GET /api/v1/academies/{academyId}/schedules?q=&limit=&offset= — active schedules sessions can start from. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ academyId: string }> }) {
  const { academyId } = await params;
  return withStaffApi(request, METHODS, "read", (context) => schedulesResponse(context, academyId, request.nextUrl.searchParams));
}

export function OPTIONS(request: Request) {
  return preflight(request, METHODS);
}
