"use client";

import { IconCode } from "@tabler/icons-react";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

import { usePreviewAction, usePreviewStatus } from "../use-preview";

export function DeveloperModeMenuItem() {
  const status = usePreviewStatus();
  const { pending, run } = usePreviewAction();
  const data = status.data;
  if (!data?.available || data.active || !data.run) return null;
  const runId = data.run.id;
  return (
    <DropdownMenuItem
      className="gap-2 py-2"
      disabled={pending}
      onSelect={(event) => {
        event.preventDefault();
        void run("enter", { runId, studentLogicalId: null, returnTo: window.location.href });
      }}
    >
      <IconCode className="size-4" />Developer mode
    </DropdownMenuItem>
  );
}
