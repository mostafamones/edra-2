import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getAuthErrorMessage } from "@/modules/auth/errors";
import { completePasswordRecovery } from "@/modules/auth/recovery";
import { recoverPasswordSchema } from "@/modules/auth/validation";

export async function POST(request: Request) {
  const body = recoverPasswordSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Check your code and new password." }, { status: 400 });

  const result = await completePasswordRecovery(body.data);
  if (!result.ok) {
    if (result.stage === "signout") {
      return NextResponse.json(
        {
          error: "Your password was changed, but we could not sign out your other devices. Sign in with the new password and use Sign out everywhere.",
          passwordUpdated: true,
        },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { error: getAuthErrorMessage(new Error(result.message)), passwordUpdated: false },
      { status: result.stage === "verify" ? 400 : 502 },
    );
  }

  // Drop any ordinary session this browser held; it was revoked by the global sign-out.
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
