/** Path of the staff invitation entry route; the token is the final segment. */
export const STAFF_INVITE_PATH = "/invite/staff/";

/** 32 random bytes in base64url. Matches the database check in create_staff_invitation. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isStaffInviteToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

/**
 * Accepts a token directly or extracts it from an Edra staff invitation link. Only links on the configured Edra
 * origin are accepted; the URL is parsed, never fetched.
 */
export function parseStaffInviteLink(value: string, origin: string) {
  const text = value.trim();
  if (!text || text.length > 512) return null;
  if (isStaffInviteToken(text)) return text;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.origin !== new URL(origin).origin || url.username || url.password) return null;
  if (!url.pathname.startsWith(STAFF_INVITE_PATH)) return null;
  const token = url.pathname.slice(STAFF_INVITE_PATH.length).replace(/\/$/, "");
  return isStaffInviteToken(token) ? token : null;
}
