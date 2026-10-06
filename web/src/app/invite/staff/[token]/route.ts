import { NextResponse, type NextRequest } from "next/server";
import { platformOrigin, staffInviteHref } from "../../../../lib/routing";

import { PENDING_STAFF_INVITE_COOKIE, isStaffInviteToken, pendingStaffInviteCookie } from "../../../../modules/staff/server";

// Opening a link only records the pending invitation and moves to a URL without the secret. It
// never looks the invitation up, consumes it, or creates a membership, so previews, scanners, and
// prefetches are harmless. Acceptance needs an explicit confirmation on the join screen.
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const headers = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
  if (!isStaffInviteToken(token)) {
    return new Response("This staff invitation link is not valid. Check that you copied the whole link.", { status: 400, headers });
  }

  if (request.headers.get("host")?.toLowerCase() !== new URL(platformOrigin("staff")).host.toLowerCase()) {
    const canonical = NextResponse.redirect(staffInviteHref(token), 303);
    for (const [name, value] of Object.entries(headers)) canonical.headers.set(name, value);
    return canonical;
  }
  const response = NextResponse.redirect(new URL("/onboarding/instructor/join", platformOrigin("staff")), 303);
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
  response.cookies.set(PENDING_STAFF_INVITE_COOKIE, token, pendingStaffInviteCookie);
  return response;
}
