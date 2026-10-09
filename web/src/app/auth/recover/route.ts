import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getAuthErrorMessage } from "@/modules/auth/errors";
import {
  RECOVERY_COOKIE,
  RECOVERY_COOKIE_PATH,
  completePasswordRecovery,
  decodeRecoveryTokens,
} from "@/modules/auth/recovery";
import { recoverPasswordSchema } from "@/modules/auth/validation";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  path: RECOVERY_COOKIE_PATH,
} as const;

function json(body: Record<string, unknown>, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("cache-control", "private, no-store");
  return response;
}

const EXPIRED = "Your verification has expired. Request a new code.";

/** Development builds name the failing check, matching getAuthErrorMessage. */
function expiredMessage(reason: string) {
  return process.env.NODE_ENV === "development" ? `${EXPIRED} (${reason})` : EXPIRED;
}

function clearRecovery(response: NextResponse) {
  response.cookies.set(RECOVERY_COOKIE, "", { ...COOKIE_OPTIONS, maxAge: 0 });
  return response;
}

export async function POST(request: NextRequest) {
  const body = recoverPasswordSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return json({ error: "Check your new password." }, 400);

  const tokens = decodeRecoveryTokens(request.cookies.get(RECOVERY_COOKIE)?.value);
  if (!tokens) return json({ error: expiredMessage("no recovery cookie") }, 401);

  const result = await completePasswordRecovery(body.data.password, tokens);
  if (!result.ok) {
    if (result.stage === "signout") {
      return clearRecovery(json(
        {
          error: "Your password was changed, but we could not sign out your other devices. Sign in with the new password and use Sign out everywhere.",
          passwordUpdated: true,
        },
        502,
      ));
    }
    if (result.stage === "session") {
      console.error("Password recovery session rejected:", result.message);
      return clearRecovery(json({ error: expiredMessage(result.message.slice(0, 240)) }, 401));
    }
    // The password was rejected; keep the verified session so another password can be tried.
    return json({ error: getAuthErrorMessage(new Error(result.message)), passwordUpdated: false }, 400);
  }

  // Drop any ordinary session this browser held; it was revoked by the global sign-out.
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  return clearRecovery(json({ ok: true }));
}
