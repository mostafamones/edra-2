import { createClient } from "@/lib/supabase/client";

import type {
  ResetPasswordInput,
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

export async function updateRecoveredPassword(input: ResetPasswordInput) {
  return createClient().auth.updateUser({ password: input.password });
}

export async function signOutEverywhere() {
  return createClient().auth.signOut({ scope: "global" });
}
