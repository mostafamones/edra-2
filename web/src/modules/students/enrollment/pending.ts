// Server-only. The pending invite is untrusted input: it only names a token for academy onboarding,
// which the database re-checks on every preview and completion.

export const PENDING_STUDENT_INVITE_COOKIE = "edra_pending_student_invite";

export const pendingStudentInviteCookie = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
} as const;
