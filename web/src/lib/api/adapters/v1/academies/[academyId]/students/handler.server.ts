import "@tanstack/react-start/server-only";

import { withStaffApi } from "@/lib/api/handler";
import { preflight } from "@/lib/api/http";
import { studentsResponse } from "@/modules/students/server";

const METHODS = "GET, OPTIONS";

/** GET /api/v1/academies/{academyId}/students?search=&status=&page=&page_size= — open-year records, by name. */
export async function GET(request: Request, { params }: { params: Promise<{ academyId: string }> }) {
  const { academyId } = await params;
  return withStaffApi(request, METHODS, "read", (context) => studentsResponse(context, academyId, new URL(request.url).searchParams));
}

export function OPTIONS(request: Request) {
  return preflight(request, METHODS);
}
