import type { NextResponse } from "next/server";

// Server-only. The pending invitation is untrusted input: it only names a token for the join screen,
// which the database re-checks on every preview and acceptance.

export const PENDING_STAFF_INVITE_COOKIE = "edra_pending_staff_invite";

/** Never longer than an invitation's lifetime. */
export const pendingStaffInviteCookie = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
} as const;

export function clearPendingStaffInvite(response: NextResponse) {
  response.cookies.set(PENDING_STAFF_INVITE_COOKIE, "", { ...pendingStaffInviteCookie, maxAge: 0 });
}
