import { NextResponse, type NextRequest } from "next/server";
import { platformOrigin, studentInviteHref } from "../../../../lib/routing";

import { PENDING_STUDENT_INVITE_COOKIE, pendingStudentInviteCookie } from "../../../../modules/students/enrollment/pending";
import { isStudentInviteToken } from "../../../../modules/students/enrollment/types";

// Opening a link only records the pending invite and moves to a URL without the secret. It never
// looks the invite up or links an account, so previews, scanners and prefetches are harmless.
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const headers = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
  if (!isStudentInviteToken(token)) {
    return new Response("This student invite link is not valid. Check that you copied the whole link.", { status: 400, headers });
  }

  if (request.headers.get("host")?.toLowerCase() !== new URL(platformOrigin("student")).host.toLowerCase()) {
    const canonical = NextResponse.redirect(studentInviteHref(token), 303);
    for (const [name, value] of Object.entries(headers)) canonical.headers.set(name, value);
    return canonical;
  }
  const response = NextResponse.redirect(new URL("/onboarding/student/join", platformOrigin("student")), 303);
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
  response.cookies.set(PENDING_STUDENT_INVITE_COOKIE, token, pendingStudentInviteCookie);
  return response;
}
