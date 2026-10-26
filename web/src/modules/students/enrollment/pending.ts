// Server-only. The pending entry is untrusted input: it only names a token for academy onboarding,
// which the database re-checks on every preview and completion. One entry is pending at a time.

import { isStudentInviteToken } from "./types";

export const PENDING_STUDENT_INVITE_COOKIE = "edra_pending_student_invite";

export const pendingStudentInviteCookie = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
} as const;

/** Which authority the token carries. The kind selects the database wrapper; it never widens authority. */
export type PendingStudentEntry = { kind: "invite" | "booking"; token: string };

// Tokens are base64url, so the "." separator cannot appear inside one. Invite values stay bare tokens.
const BOOKING_PREFIX = "booking.";

export function pendingStudentEntryValue(entry: PendingStudentEntry) {
  return entry.kind === "booking" ? BOOKING_PREFIX + entry.token : entry.token;
}

/** null when nothing is pending; "invalid" for a malformed value. */
export function parsePendingStudentEntry(value: string | undefined): PendingStudentEntry | "invalid" | null {
  if (!value) return null;
  const booking = value.startsWith(BOOKING_PREFIX);
  const token = booking ? value.slice(BOOKING_PREFIX.length) : value;
  return isStudentInviteToken(token) ? { kind: booking ? "booking" : "invite", token } : "invalid";
}
