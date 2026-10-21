"use client";

import { useEffect, useState } from "react";
import { IconCircleCheck, IconCloudOff, IconDeviceFloppy, IconLoader2, type Icon } from "@tabler/icons-react";

import { cn } from "@/lib/utils";

import type { AnsweringSnapshot } from "../answering/controller";
import { pendingCount } from "../answering/drafts";

const SAVED = "All answers saved";

type Status = { icon: Icon; text: string; tone?: "muted" | "warning"; spin?: boolean };

/**
 * Saved means acknowledged by the server. Pending answers are never called saved: offline they are
 * either kept on this device (the journal write succeeded) or not stored anywhere yet.
 */
export function saveStatus(state: AnsweringSnapshot): Status | null {
  if (state.phase === "loading" || state.phase === "finished" || state.phase === "blocked") return null;
  if (state.phase === "expired") return { icon: IconLoader2, text: "Time is up", spin: true };
  if (state.submitStage === "sending") return { icon: IconLoader2, text: "Submitting…", spin: true };
  if (Object.keys(state.drafts.conflicts).length > 0) return { icon: IconCloudOff, text: "Resolve changed answers", tone: "warning" };
  const pending = pendingCount(state.drafts) > 0 || state.drafts.inflight !== null;
  if (!pending) return state.submitStage ? { icon: IconLoader2, text: "Submitting…", spin: true } : { icon: IconCircleCheck, text: SAVED, tone: "muted" };
  if (state.network === "offline" || state.submitStage === "waiting") {
    return state.stored && state.journal === "ok"
      ? { icon: IconDeviceFloppy, text: "Offline · Kept on this device", tone: "warning" }
      : { icon: IconCloudOff, text: "Offline · Not saved", tone: "warning" };
  }
  if (state.journal !== "ok") return { icon: IconLoader2, text: "Saving… (not kept on this device)", spin: true };
  return { icon: IconLoader2, text: "Saving…", spin: true };
}

/** Shown while something is happening; "All answers saved" fades out after a moment. The live region stays mounted. */
export function StudentExamSaveStatus({ state, className }: { state: AnsweringSnapshot; className?: string }) {
  const status = saveStatus(state);
  const text = status?.text ?? null;
  const [shown, setShown] = useState(text);
  const [hidden, setHidden] = useState(false);
  if (shown !== text) { setShown(text); setHidden(false); }
  useEffect(() => {
    if (text !== SAVED) return;
    const timer = setTimeout(() => setHidden(true), 2000);
    return () => clearTimeout(timer);
  }, [text]);
  return (
    <span role="status" aria-live="polite" className={cn("inline-flex min-h-5 min-w-0 items-center gap-1.5 text-xs transition-opacity duration-300",
      status?.tone === "warning" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground", hidden && "opacity-0", className)}>
      {status && <><status.icon className={cn("size-3.5 shrink-0", status.spin && "animate-spin")} aria-hidden="true" /><span className="truncate">{status.text}</span></>}
    </span>
  );
}
