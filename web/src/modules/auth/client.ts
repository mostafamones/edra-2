import { createClient } from "@/lib/supabase/client";

import type {
  RecoverPasswordInput,
  SignInInput,
  SignUpInput,
  VerificationInput,
} from "./validation";

export async function signIn(input: SignInInput) {
  return createClient().auth.signInWithPassword(input);
}

export async function signUp(input: SignUpInput) {
  return createClient().auth.signUp({
    phone: input.phone,
    password: input.password,
    options: {
      channel: "sms",
      data: { full_name: input.fullName },
    },
  });
}

/**
 * Verifies a signup code. A phone-code session has no application authority (the database only
 * accepts password sessions), so it is revoked and replaced by a password sign-in. `signedIn` is
 * false when the password is unavailable or rejected; the caller then sends the user to sign in.
 */
export async function verifySignup(input: VerificationInput, password: string | null) {
  const supabase = createClient();
  const verification = await supabase.auth.verifyOtp({
    phone: input.phone,
    token: input.code,
    type: "sms",
  });
  if (verification.error) return { error: verification.error, signedIn: false };
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  if (!password) return { error: null, signedIn: false };
  const { error } = await supabase.auth.signInWithPassword({ phone: input.phone, password });
  return { error: null, signedIn: !error };
}

export async function resendSignupCode(phone: string) {
  return createClient().auth.resend({ phone, type: "sms" });
}

export async function requestPasswordRecovery(phone: string) {
  return createClient().auth.signInWithOtp({
    phone,
    options: { channel: "sms", shouldCreateUser: false },
  });
}

async function postRecovery(path: string, input: unknown): Promise<{ error: string | null }> {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (response.ok) return { error: null };
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    return { error: body?.error ?? "We could not complete password recovery. Please try again." };
  } catch {
    return { error: "We could not reach the server. Check your connection and try again." };
  }
}

/** Recovery runs on the server; the browser never receives a recovery session. */
export function verifyRecoveryCode(input: VerificationInput) {
  return postRecovery("/auth/recover/verify", input);
}

export function recoverPassword(input: RecoverPasswordInput) {
  return postRecovery("/auth/recover", input);
}
