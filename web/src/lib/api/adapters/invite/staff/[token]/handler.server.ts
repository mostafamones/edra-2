import "@tanstack/react-start/server-only";
import { serializeCookieHeader } from "@supabase/ssr";
import { platformOrigin, staffInviteHref } from "@/lib/routing";

import { PENDING_STAFF_INVITE_COOKIE, isStaffInviteToken, pendingStaffInviteCookie } from "@/modules/staff/server";

// Opening a link only records the pending invitation and moves to a URL without the secret. It
// never looks the invitation up, consumes it, or creates a membership, so previews, scanners, and
// prefetches are harmless. Acceptance needs an explicit confirmation on the join screen.
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const headers = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
  if (!isStaffInviteToken(token)) {
    return new Response("This staff invitation link is not valid. Check that you copied the whole link.", { status: 400, headers });
  }

  if (request.headers.get("host")?.toLowerCase() !== new URL(platformOrigin("staff")).host.toLowerCase()) {
    const canonical = new Response(null, { status: 303, headers: { location: String(staffInviteHref(token)) } });
    for (const [name, value] of Object.entries(headers)) canonical.headers.set(name, value);
    return canonical;
  }
  const response = new Response(null, { status: 303, headers: { location: String(new URL("/onboarding/instructor/join", platformOrigin("staff"))) } });
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
  response.headers.append("set-cookie", serializeCookieHeader(PENDING_STAFF_INVITE_COOKIE, token, pendingStaffInviteCookie).replace("SameSite=Lax", "SameSite=lax"));
  return response;
}
