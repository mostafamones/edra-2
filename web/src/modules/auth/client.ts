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

export async function verifyPhoneCode(input: VerificationInput) {
  return createClient().auth.verifyOtp({
    phone: input.phone,
    token: input.code,
    type: "sms",
  });
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

/** Recovery is completed by the server; the browser never receives a recovery session. */
export async function recoverPassword(input: RecoverPasswordInput): Promise<{ error: string | null }> {
  try {
    const response = await fetch("/auth/recover", {
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
