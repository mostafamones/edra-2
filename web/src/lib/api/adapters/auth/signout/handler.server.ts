import "@tanstack/react-start/server-only";
import { cookies, headers } from "@/lib/server/request";
import { serializeCookieHeader } from "@supabase/ssr";
import { authCookieOptions, AUTH_COOKIE_NAME, isLegacyAuthCookie } from "@/lib/supabase/cookie-policy";
import { platformOrigin, ROUTE_HEADER } from "@/lib/routing";

import { createClient } from "@/lib/supabase/server";
import { clearedControlCookie, clearedFailureCookie, endPreviewForSignOut } from "@/modules/development/server";
import { PENDING_STAFF_INVITE_COOKIE, pendingStaffInviteCookie } from "@/modules/staff/server";
import { safeNextPath } from "@/modules/auth/return-path";
import { forgetPushSubscriptions } from "@/modules/notifications/server";

export async function POST(request: Request) {
  const next = new URL(request.url).searchParams.get("next");
  // Developer mode: end the control and revoke its sessions and the preserved original session first.
  // A failed provider revocation is logged; the ended control already denies generated-account authority.
  if (!(await endPreviewForSignOut().catch(() => false))) console.error("Developer mode sign-out cleanup needs a retry");
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) {
    // Global sign-out also ends browser push previews on every device for this account.
    await forgetPushSubscriptions(supabase);
    await supabase.auth.signOut({ scope: "global" });
  }
  const platform = (await headers()).get(ROUTE_HEADER) === "student" ? "student" : "staff";
  const login = new URL("/auth/login", platformOrigin(platform));
  if (next) login.searchParams.set("next", safeNextPath(next, "/", platform));
  const response = new Response(null, { status: 303, headers: { location: login.toString() } });
  response.headers.set("cache-control", "private, no-store");
  response.headers.append("set-cookie", serializeCookieHeader("edra_recovery_pending", "", { httpOnly: true, maxAge: 0, path: "/", sameSite: "lax" }).replace("SameSite=Lax", "SameSite=lax"));
  response.headers.append("set-cookie", serializeCookieHeader("edra_recovery_session", "", { httpOnly: true, maxAge: 0, path: "/auth/recover", sameSite: "strict" }).replace("SameSite=Strict", "SameSite=strict"));
  response.headers.append("set-cookie", serializeCookieHeader("edra_pending_student_invite", "", { httpOnly: true, maxAge: 0, path: "/", sameSite: "lax" }).replace("SameSite=Lax", "SameSite=lax"));
  response.headers.append("set-cookie", serializeCookieHeader(PENDING_STAFF_INVITE_COOKIE, "", { ...pendingStaffInviteCookie, maxAge: 0 }).replace("SameSite=Lax", "SameSite=lax"));
  for (const { name, value, ...options } of [clearedControlCookie(), clearedFailureCookie()]) response.headers.append("set-cookie", serializeCookieHeader(name, value, options).replace("SameSite=Lax", "SameSite=lax"));
  const policy = authCookieOptions();
  const names = new Set([AUTH_COOKIE_NAME, ...(await cookies()).getAll().map(cookie => cookie.name)]);
  for (const name of names) {
    if (name === AUTH_COOKIE_NAME || name.startsWith(`${AUTH_COOKIE_NAME}.`) || isLegacyAuthCookie(name)) {
      response.headers.append("set-cookie", serializeCookieHeader(name, "", { ...policy, maxAge: 0 }));
      response.headers.append("set-cookie", serializeCookieHeader(name, "", { path: "/", maxAge: 0 }));
    }
  }
  return response;
}
