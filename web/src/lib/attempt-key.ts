"use client";

import { useRef } from "react";

import { newUuid } from "@/lib/uuid";

/**
 * One idempotency key per distinct payload. A retry of the same unsent or unconfirmed payload
 * reuses its key (the server replays instead of applying twice); a changed payload gets a new key.
 */
export function useAttemptKey() {
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  return {
    keyFor(fingerprint: string): string {
      if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: newUuid() };
      return attempt.current.key;
    },
    reset() { attempt.current = null; },
  };
}
