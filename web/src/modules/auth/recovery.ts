import { createClient as createStatelessClient, type SupabaseClient } from "@supabase/supabase-js";

import type { RecoverPasswordInput } from "./validation";

export type RecoveryResult =
  | { ok: true }
  | { ok: false; stage: "verify" | "update" | "signout"; message: string; passwordUpdated: boolean };

const SIGN_OUT_ATTEMPTS = 3;

export function createRecoveryClient() {
  return createStatelessClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
}

/**
 * Password recovery runs entirely on the server. The recovery OTP is exchanged for a
 * session that lives only in this request's memory: it is never written to cookies or
 * returned to the browser, so a recovery code cannot be used for ordinary account access.
 * The session is used once to set the new password, then revoked globally.
 */
export async function completePasswordRecovery(
  input: RecoverPasswordInput,
  client: SupabaseClient = createRecoveryClient(),
): Promise<RecoveryResult> {
  const verified = await client.auth.verifyOtp({ phone: input.phone, token: input.code, type: "sms" });
  if (verified.error || !verified.data.session) {
    return { ok: false, stage: "verify", message: verified.error?.message ?? "Verification failed", passwordUpdated: false };
  }

  const updated = await client.auth.updateUser({ password: input.password });
  if (updated.error) {
    // The password is unchanged: revoke the scoped session so nothing outlives this request.
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
    return { ok: false, stage: "update", message: updated.error.message, passwordUpdated: false };
  }

  let lastError = "Sign-out failed";
  for (let attempt = 0; attempt < SIGN_OUT_ATTEMPTS; attempt += 1) {
    const { error } = await client.auth.signOut({ scope: "global" }).catch((e: unknown) => ({
      error: e instanceof Error ? e : new Error(String(e)),
    }));
    if (!error) return { ok: true };
    lastError = error.message;
  }
  return { ok: false, stage: "signout", message: lastError, passwordUpdated: true };
}
