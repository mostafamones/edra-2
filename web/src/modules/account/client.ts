import { createClient } from "@/lib/supabase/client";

export type PasswordChallenge = { id: string; phoneLast4: string; expiresAt: string; retryAt: string };

export type PasswordFailure = { ok: false; error: string; retryAt?: string | null; message?: string | null };
type Result<T> = { ok: true; value: T } | PasswordFailure;

/** Calls the account-password Edge Function with the current session's access token. */
async function invoke<T>(body: Record<string, string>): Promise<Result<T>> {
  try {
    const { data, error } = await createClient().functions.invoke("account-password", { body });
    if (error) {
      const context = (error as { context?: unknown }).context;
      if (context instanceof Response) {
        const response = await context.json().catch(() => null);
        if (typeof response?.error === "string") {
          return { ok: false, error: response.error, retryAt: response.retryAt ?? null, message: response.message ?? null };
        }
      }
      return { ok: false, error: "unavailable" };
    }
    return { ok: true, value: data as T };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}

export function requestPasswordCode() {
  return invoke<{ challenge: PasswordChallenge }>({ action: "request" });
}

export function verifyPasswordCode(challengeId: string, code: string) {
  return invoke<{ verified: true }>({ action: "verify", challengeId, code });
}

export function completePasswordChange(challengeId: string, password: string) {
  return invoke<{ changed: true }>({ action: "complete", challengeId, password });
}

export function cancelPasswordChange(challengeId: string) {
  return invoke<{ canceled: true }>({ action: "cancel", challengeId });
}

const MESSAGES: Record<string, string> = {
  cooldown: "Wait a moment before requesting another code.",
  rate_limited: "Too many codes were requested. Try again later.",
  phone_unverified: "Your account phone isn’t verified.",
  delivery_failed: "Couldn’t send the code. Try again.",
  delivery_unavailable: "Couldn’t send the code. Try again later.",
  invalid_code: "That code is incorrect.",
  expired: "This code has expired. Request a new one.",
  locked: "Too many attempts. Request a new code.",
  used: "This verification has ended. Request a new code.",
  invalid: "This verification has ended. Request a new code.",
  unverified: "Verify the code first.",
  session_inactive: "Your session has ended. Sign in again.",
  not_authenticated: "Your session has ended. Sign in again.",
  busy: "A password change is already in progress.",
  invalid_password: "Password must contain at least 8 characters",
  uncertain: "We couldn’t confirm whether your password changed. Try again.",
};

export function passwordErrorMessage(failure: PasswordFailure) {
  if (failure.error === "password_rejected") return failure.message || "Choose a different password.";
  return MESSAGES[failure.error] ?? "Something went wrong. Try again.";
}

/** Failures that end the challenge, so the flow returns to the start. */
export function endsPasswordChallenge(error: string) {
  return ["expired", "locked", "used", "invalid", "session_inactive", "not_authenticated"].includes(error);
}
