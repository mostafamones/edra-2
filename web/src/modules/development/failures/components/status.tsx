"use client";

import { useEffect, useState } from "react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";

import { clearFailure, currentArm, installTabScope } from "../browser";
import { FAILURE_CHANGE_EVENT, FAILURE_KINDS, type Arm, type FailureStatus } from "../shared";

/**
 * Armed failure status with Clear. Rendered outside the auth provider and app shell, so it stays usable
 * when a simulated failure replaces the whole application.
 */
export function FailureStatusChip() {
  const [arm, setArm] = useState<Arm | null>(null);
  const [triggered, setTriggered] = useState(0);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const refresh = () => setArm(currentArm());
    window.addEventListener(FAILURE_CHANGE_EVENT, refresh);
    const uninstall = installTabScope();
    refresh();
    return () => {
      uninstall();
      window.removeEventListener(FAILURE_CHANGE_EVENT, refresh);
    };
  }, []);

  useEffect(() => {
    if (!arm) return;
    let live = true;
    const poll = async () => {
      if (document.visibilityState === "hidden") return;
      const response = await fetch("/api/development/failures?page=-", { cache: "no-store" }).catch(() => null);
      const status = response?.ok ? (await response.json()) as FailureStatus : null;
      if (live && status?.armed?.id === arm.id) setTriggered(status.triggered);
    };
    void poll();
    const timer = setInterval(() => void poll(), 3000);
    return () => {
      live = false;
      clearInterval(timer);
      setTriggered(0);
    };
  }, [arm]);

  if (!arm) return null;
  return (
    <div role="status" className="fixed bottom-3 left-1/2 z-[60] flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-full border bg-background py-1 pr-1 pl-3 text-xs shadow-md">
      <span className="truncate">
        <span className="font-mono">{arm.operation}</span>
        {` · ${FAILURE_KINDS[arm.kind]} · ${arm.mode === "once" ? "Next request" : "Every request"} · Triggered ${triggered}×`}
      </span>
      <Button size="sm" variant="ghost" className="h-7 rounded-full" onClick={clearFailure}>
        <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.5} />Clear
      </Button>
    </div>
  );
}
