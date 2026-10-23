"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { CodeIcon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { usePreviewAction, usePreviewStatus } from "../use-preview";

/** Sidebar toggle for Developer mode: muted while off, full color while on. Clicking enters or exits the preview. */
export function DeveloperModeButton({ className }: { className?: string }) {
  const status = usePreviewStatus();
  const { pending, run } = usePreviewAction();
  const data = status.data;
  if (!data?.available || !data.run) return null;
  const runId = data.run.id;
  const active = data.active;
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Developer mode"
      aria-pressed={active}
      disabled={pending}
      className={cn(active ? "text-sidebar-foreground" : "text-sidebar-foreground/75", className)}
      onClick={() => void (active
        ? run("exit", { runId })
        : run("enter", { runId, studentLogicalId: null, returnTo: window.location.href }))}
    >
      <HugeiconsIcon icon={CodeIcon} size={20} strokeWidth={active ? 2 : 1.5} aria-hidden="true" />
    </Button>
  );
}
