import "@tanstack/react-start/server-only";

import { withStaffApi } from "@/lib/api/handler";
import { preflight } from "@/lib/api/http";
import { schedulesResponse } from "@/modules/schedules/server";

const METHODS = "GET, OPTIONS";

/** GET /api/v1/academies/{academyId}/schedules?q=&limit=&offset= — active schedules sessions can start from. */
export async function GET(request: Request, { params }: { params: Promise<{ academyId: string }> }) {
  const { academyId } = await params;
  return withStaffApi(request, METHODS, "read", (context) => schedulesResponse(context, academyId, new URL(request.url).searchParams));
}

export function OPTIONS(request: Request) {
  return preflight(request, METHODS);
}
