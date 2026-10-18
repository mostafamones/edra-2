import { isStudentInviteToken } from "./types";

/** Path of the student invite entry route; the token is the final segment. */
export const STUDENT_INVITE_PATH = "/invite/student/";

/**
 * Accepts a token directly or extracts it from an Edra student invite link. Only links on the given
 * origin are accepted; the URL is parsed, never fetched.
 */
export function parseStudentInviteLink(value: string, origin: string) {
  const text = value.trim();
  if (!text || text.length > 512) return null;
  if (isStudentInviteToken(text)) return text;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.origin !== new URL(origin).origin || url.username || url.password) return null;
  if (!url.pathname.startsWith(STUDENT_INVITE_PATH)) return null;
  const token = url.pathname.slice(STUDENT_INVITE_PATH.length).replace(/\/$/, "");
  return isStudentInviteToken(token) ? token : null;
}
