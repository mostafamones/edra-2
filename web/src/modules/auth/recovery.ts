import { createClient as createStatelessClient, type SupabaseClient } from "@supabase/supabase-js";

import type { VerificationInput } from "./validation";

export type RecoveryTokens = { accessToken: string; refreshToken: string };

export type VerifyRecoveryResult = { ok: true; tokens: RecoveryTokens } | { ok: false; message: string };

export type RecoveryResult =
  | { ok: true }
  | { ok: false; stage: "session" | "update"; message: string; passwordUpdated: false }
  | { ok: false; stage: "signout"; message: string; passwordUpdated: true };

/** Recovery cookie: httpOnly, scoped to the recovery route, and short-lived. */
export const RECOVERY_COOKIE = "edra_recovery_session";
export const RECOVERY_COOKIE_PATH = "/auth/recover";
export const RECOVERY_WINDOW_SECONDS = 10 * 60;

const SIGN_OUT_ATTEMPTS = 3;

export function createRecoveryClient() {
  return createStatelessClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
}

export function encodeRecoveryTokens(tokens: RecoveryTokens) {
  return Buffer.from(JSON.stringify(tokens)).toString("base64url");
}

export function decodeRecoveryTokens(value: string | undefined): RecoveryTokens | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString()) as Partial<RecoveryTokens>;
    return typeof parsed.accessToken === "string" && typeof parsed.refreshToken === "string"
      ? { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken }
      : null;
  } catch {
    return null;
  }
}

/**
 * Password recovery runs entirely on the server. The recovery OTP is verified on its own step so a
 * wrong code is reported immediately, and the resulting session is held only in an httpOnly cookie
 * scoped to the recovery route; it never reaches browser JavaScript. The database also refuses
 * every phone-code session for application operations (edra_auth.check_request), so the session
 * grants nothing beyond setting a password.
 */
export async function verifyRecoveryCode(
  input: VerificationInput,
  client: SupabaseClient = createRecoveryClient(),
): Promise<VerifyRecoveryResult> {
  const verified = await client.auth.verifyOtp({ phone: input.phone, token: input.code, type: "sms" });
  const session = verified.data.session;
  if (verified.error || !session) return { ok: false, message: verified.error?.message ?? "Verification failed" };
  return { ok: true, tokens: { accessToken: session.access_token, refreshToken: session.refresh_token } };
}

/**
 * Sets the new password with the verified recovery session, then revokes every session globally,
 * which also invalidates other sessions' unexpired access tokens. A rejected password leaves the
 * recovery session in place so the user can choose another without requesting a new code.
 */
export async function completePasswordRecovery(
  password: string,
  tokens: RecoveryTokens,
  client: SupabaseClient = createRecoveryClient(),
): Promise<RecoveryResult> {
  const restored = await client.auth.setSession({ access_token: tokens.accessToken, refresh_token: tokens.refreshToken });
  if (restored.error || !restored.data.session) {
    return { ok: false, stage: "session", message: restored.error?.message ?? "Recovery session expired", passwordUpdated: false };
  }

  const updated = await client.auth.updateUser({ password });
  if (updated.error) {
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
