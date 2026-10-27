import { NextResponse, type NextRequest } from "next/server";
import { platformOrigin, studentBookingHref } from "../../../../../lib/routing";

import {
  PENDING_STUDENT_INVITE_COOKIE, pendingStudentEntryValue, pendingStudentInviteCookie,
} from "../../../../../modules/students/enrollment/pending";
import { isStudentInviteToken } from "../../../../../modules/students/enrollment/types";

// Hands a booking link to verified academy onboarding: it only records the pending booking entry and
// moves to a URL without the secret. It never looks the booking up or links an account.
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const headers = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
  if (!isStudentInviteToken(token)) {
    return new Response("This booking link is not valid. Check that you copied the whole link.", { status: 400, headers });
  }

  if (request.headers.get("host")?.toLowerCase() !== new URL(platformOrigin("student")).host.toLowerCase()) {
    const canonical = NextResponse.redirect(studentBookingHref(token, "/join"), 303);
    for (const [name, value] of Object.entries(headers)) canonical.headers.set(name, value);
    return canonical;
  }
  const response = NextResponse.redirect(new URL("/onboarding/student/join", platformOrigin("student")), 303);
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
  response.cookies.set(PENDING_STUDENT_INVITE_COOKIE, pendingStudentEntryValue({ kind: "booking", token }), pendingStudentInviteCookie);
  return response;
}
