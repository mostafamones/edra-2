import "@tanstack/react-start/server-only";
import { serializeCookieHeader } from "@supabase/ssr";
import { platformOrigin, studentBookingHref } from "@/lib/routing";

import {
  PENDING_STUDENT_INVITE_COOKIE, pendingStudentEntryValue, pendingStudentInviteCookie,
} from "@/modules/students/enrollment/pending";
import { isStudentInviteToken } from "@/modules/students/enrollment/types";

// Hands a booking link to verified academy onboarding: it only records the pending booking entry and
// moves to a URL without the secret. It never looks the booking up or links an account.
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const headers = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
  if (!isStudentInviteToken(token)) {
    return new Response("This booking link is not valid. Check that you copied the whole link.", { status: 400, headers });
  }

  if (request.headers.get("host")?.toLowerCase() !== new URL(platformOrigin("student")).host.toLowerCase()) {
    const canonical = new Response(null, { status: 303, headers: { location: String(studentBookingHref(token, "/join")) } });
    for (const [name, value] of Object.entries(headers)) canonical.headers.set(name, value);
    return canonical;
  }
  const response = new Response(null, { status: 303, headers: { location: String(new URL("/onboarding/student/join", platformOrigin("student"))) } });
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
  response.headers.append("set-cookie", serializeCookieHeader(PENDING_STUDENT_INVITE_COOKIE, pendingStudentEntryValue({ kind: "booking", token }), pendingStudentInviteCookie).replace("SameSite=Lax", "SameSite=lax"));
  return response;
}
