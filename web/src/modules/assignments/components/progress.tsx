"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { Progress } from "@/components/ui/progress";

const subscribe = () => () => undefined;
const findInset = () => document.querySelector<HTMLElement>("[data-slot='sidebar-inset']");

/** The step actions and progress, pinned to the bottom edge of the page content (the sidebar inset), not over the sidebar. */
export function StepFooter({ value, label, children }: { value: number; label: string; children: React.ReactNode }) {
  const inset = useSyncExternalStore(subscribe, findInset, () => null);
  if (!inset) return null;
  return createPortal(
    <div className="sticky bottom-0 z-20 mt-auto w-full bg-background">
      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-2 border-t px-4 py-3 sm:px-6">{children}</div>
      <Progress value={value} aria-label={label} className="h-1.5 rounded-none" />
    </div>,
    inset,
  );
}
