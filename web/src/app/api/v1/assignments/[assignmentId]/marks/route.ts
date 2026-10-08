import type { NextRequest } from "next/server";

import { withStaffApi } from "@/lib/api/handler";
import { preflight } from "@/lib/api/http";
import { marksResponse, patchMarksResponse, withAssignmentAcademy } from "@/modules/assignments/server";

const METHODS = "GET, PATCH, OPTIONS";

/** GET /api/v1/assignments/{assignmentId}/marks?filter=&limit=&offset= — students with work status, marks, and result state. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  return withStaffApi(request, METHODS, "read", (context) =>
    withAssignmentAcademy(context, assignmentId, (academyId) => marksResponse(context, academyId, assignmentId, request.nextUrl.searchParams)));
}

/** PATCH /api/v1/assignments/{assignmentId}/marks — save one student's marks (Idempotency-Key required). */
export async function PATCH(request: Request, { params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  return withStaffApi(request, METHODS, "write", (context) =>
    withAssignmentAcademy(context, assignmentId, (academyId) => patchMarksResponse(context, request, academyId, assignmentId)));
}

export function OPTIONS(request: Request) {
  return preflight(request, METHODS);
}
