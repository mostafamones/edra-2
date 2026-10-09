import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { serializeCookieHeader } from "@supabase/ssr";
import { authCookieOptions, AUTH_COOKIE_NAME, isLegacyAuthCookie } from "../../../lib/supabase/cookie-policy";
import { platformOrigin, ROUTE_HEADER } from "../../../lib/routing";
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { clearPendingStaffInvite } from "@/modules/staff/server";

export async function POST() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) await supabase.auth.signOut({ scope: "global" });
  revalidatePath("/", "layout");
  const platform = (await headers()).get(ROUTE_HEADER) === "student" ? "student" : "staff";
  const response = NextResponse.redirect(new URL("/auth/login", platformOrigin(platform)), 303);
  response.headers.set("cache-control", "private, no-store");
  response.cookies.set("edra_recovery_pending", "", { httpOnly: true, maxAge: 0, path: "/", sameSite: "lax" });
  response.cookies.set("edra_recovery_session", "", { httpOnly: true, maxAge: 0, path: "/auth/recover", sameSite: "strict" });
  response.cookies.set("edra_pending_student_invite", "", { httpOnly: true, maxAge: 0, path: "/", sameSite: "lax" });
  clearPendingStaffInvite(response);
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
