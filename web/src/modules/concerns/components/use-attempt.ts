import { useRef, useState } from "react";
import type { ConcernFailure } from "../errors";
import { useConcernFence } from "./use-fence";

type Result = { ok: true } | ConcernFailure;

/**
 * One lifecycle/membership command at a time. Each new attempt gets a fresh request id; an
 * uncertain (`unavailable`) result keeps the id and payload so Retry cannot repeat the action.
 */
export function useConcernAttempt() {
  const isCurrent = useConcernFence();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ConcernFailure | null>(null);
  const [uncertain, setUncertain] = useState<{ call: (requestId: string) => Promise<Result>; requestId: string; onSuccess?: () => void } | null>(null);
  const busy = useRef(false);
  async function attempt(call: (requestId: string) => Promise<Result>, requestId: string, onSuccess?: () => void) {
    if (busy.current) return;
    busy.current = true; setPending(true); setFailure(null);
    const result = await call(requestId);
    busy.current = false;
    if (!isCurrent()) return;
    setPending(false);
    if (result.ok) { setUncertain(null); onSuccess?.(); return; }
    setFailure(result);
    setUncertain(result.code === "unavailable" ? { call, requestId, onSuccess } : null);
  }
  return {
    pending, failure, uncertain: uncertain !== null,
    run: (call: (requestId: string) => Promise<Result>, onSuccess?: () => void) => attempt(call, crypto.randomUUID(), onSuccess),
    retry: () => { if (uncertain) void attempt(uncertain.call, uncertain.requestId, uncertain.onSuccess); },
    reset: () => { setFailure(null); setUncertain(null); },
  };
}
