"use client";

import { createPortal } from "react-dom";

import { useIsHydrated } from "./use-is-hydrated";

export function OnboardingProgressBar({ progress, label }: { progress: number; label: string }) {
  const mounted = useIsHydrated();
  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-x-0 bottom-0 z-50 h-1.5 bg-muted/80"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
    >
      <div
        className="h-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
        style={{ width: `${Math.round(progress * 100)}%` }}
      />
    </div>,
    document.body,
  );
}
