import { createClient } from "@/lib/supabase/client";

export type ParentChallenge = {
  id: string;
  phone: string;
  expiresAt: string;
  retryAt: string;
};

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

async function invoke<T>(body: Record<string, string>): Promise<Result<T>> {
  try {
    const { data, error } = await createClient().functions.invoke("student-onboarding", { body });
    if (error) {
      const context = (error as { context?: unknown }).context;
      if (context instanceof Response) {
        const response = await context.json().catch(() => null);
        if (typeof response?.error === "string") return { ok: false, error: response.error };
      }
      return { ok: false, error: "unavailable" };
    }
    return { ok: true, value: data as T };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}

export function getPendingParentChallenge() {
  return invoke<{ challenge: ParentChallenge | null; retryAt: string | null }>({ action: "status" });
}

export function requestParentCode(phone: string) {
  return invoke<{ challenge: ParentChallenge }>({ action: "request", phone });
}

export function invalidateParentChallenge(challengeId: string) {
  return invoke<{ invalidated: true }>({ action: "invalidate", challengeId });
}

export function verifyParentCode(challengeId: string, code: string) {
  return invoke<{ verified: true }>({ action: "verify", challengeId, code });
}

export function completeStudentProfile(levelId: string) {
  return invoke<{ completed: true }>({ action: "complete", levelId });
}
