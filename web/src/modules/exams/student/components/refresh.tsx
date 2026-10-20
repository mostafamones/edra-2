"use client";

import { useEffect, useEffectEvent, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconAlertCircle, IconLoader2, IconRefresh } from "@tabler/icons-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const POLL_MS = 30_000;
const FOCUS_MS = 10_000;
const MAX_DELAY_MS = 24 * 60 * 60 * 1000;

type Props = {
  /** Recheck every 30 seconds while a result, solutions or settlement are awaited. */
  poll: boolean;
  /** Actual closure, when still ahead: the page asks the server again at that instant. */
  refreshAt: string | null;
  serverNow: string;
  /** A failed read: shown with Retry. Status already on the page is left as it is. */
  failure?: string;
};

/**
 * Re-renders the server overview and review (router.refresh) on focus or visibility return, while
 * awaiting and at actual closure. The browser never unlocks anything itself: every refresh is a
 * fresh authorized read. Offline refreshes are skipped and resume on reconnect.
 */
export function StudentExamRefresh({ poll, refreshAt, serverNow, failure }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const last = useRef(0);

  function refresh() {
    if (!navigator.onLine) return;
    last.current = Date.now();
    startTransition(() => router.refresh());
  }

  const onReturn = useEffectEvent(() => {
    if (document.visibilityState === "visible" && Date.now() - last.current >= FOCUS_MS) refresh();
  });
  const onTick = useEffectEvent(() => {
    if (document.visibilityState === "visible") refresh();
  });

  useEffect(() => {
    const back = () => onReturn();
    window.addEventListener("focus", back);
    window.addEventListener("online", back);
    document.addEventListener("visibilitychange", back);
    return () => {
      window.removeEventListener("focus", back);
      window.removeEventListener("online", back);
      document.removeEventListener("visibilitychange", back);
    };
  }, []);

  useEffect(() => {
    if (!poll) return;
    const timer = setInterval(() => onTick(), POLL_MS);
    return () => clearInterval(timer);
  }, [poll]);

  useEffect(() => {
    if (!refreshAt) return;
    const delay = Date.parse(refreshAt) - Date.parse(serverNow) + 1_000;
    if (!(delay > 0) || delay > MAX_DELAY_MS) return;
    const timer = setTimeout(() => onTick(), delay);
    return () => clearTimeout(timer);
  }, [refreshAt, serverNow]);

  if (!failure) return null;
  return (
    <Alert role="alert">
      <IconAlertCircle aria-hidden="true" />
      <AlertTitle>{failure}</AlertTitle>
      <AlertDescription>
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={refresh}>
          {pending ? <IconLoader2 className="animate-spin" aria-hidden="true" /> : <IconRefresh aria-hidden="true" />}Retry
        </Button>
      </AlertDescription>
    </Alert>
  );
}
