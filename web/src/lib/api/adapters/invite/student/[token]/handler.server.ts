import "@tanstack/react-start/server-only";
import { serializeCookieHeader } from "@supabase/ssr";
import { platformOrigin, studentInviteHref } from "@/lib/routing";

import { PENDING_STUDENT_INVITE_COOKIE, pendingStudentInviteCookie } from "@/modules/students/enrollment/pending";
import { isStudentInviteToken } from "@/modules/students/enrollment/types";

// Opening a link only records the pending invite and moves to a URL without the secret. It never
// looks the invite up or links an account, so previews, scanners and prefetches are harmless.
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const headers = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
  if (!isStudentInviteToken(token)) {
    return new Response("This student invite link is not valid. Check that you copied the whole link.", { status: 400, headers });
  }

  if (request.headers.get("host")?.toLowerCase() !== new URL(platformOrigin("student")).host.toLowerCase()) {
    const canonical = new Response(null, { status: 303, headers: { location: String(studentInviteHref(token)) } });
    for (const [name, value] of Object.entries(headers)) canonical.headers.set(name, value);
    return canonical;
  }
  const response = new Response(null, { status: 303, headers: { location: String(new URL("/onboarding/student/join", platformOrigin("student"))) } });
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
  response.headers.append("set-cookie", serializeCookieHeader(PENDING_STUDENT_INVITE_COOKIE, token, pendingStudentInviteCookie).replace("SameSite=Lax", "SameSite=lax"));
  return response;
}
