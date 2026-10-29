"use client";

import { useCallback, useSyncExternalStore } from "react";

import { useIsMobile } from "@/hooks/use-mobile";

export const VIEWS = ["table", "cards"] as const;
export type AssessmentView = (typeof VIEWS)[number];

const CHANGE_EVENT = "edra:assessments-view";
// Keeps the choice for this visit when browser storage is blocked.
const volatile = new Map<string, AssessmentView>();

export const viewKey = (userId: string) => `edra:assessments-view:${userId}`;

function readView(key: string | null): AssessmentView | null {
  if (!key) return null;
  let value: string | null;
  try {
    value = window.localStorage.getItem(key);
  } catch {
    // Unavailable storage falls back to this visit's choice.
    value = volatile.get(key) ?? null;
  }
  return value === "table" || value === "cards" ? value : null;
}

/**
 * The signed-in user's Table/Cards choice on this browser. Without a saved choice: Cards below the
 * mobile breakpoint, Table otherwise. The server and hydration render use Table, so markup matches.
 */
export function useAssessmentView(userId: string | undefined) {
  const key = userId ? viewKey(userId) : null;
  const mobile = useIsMobile();
  const subscribe = useCallback((callback: () => void) => {
    const onStorage = (event: StorageEvent) => { if (event.key === key) callback(); };
    const onChange = (event: Event) => { if ((event as CustomEvent<string>).detail === key) callback(); };
    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGE_EVENT, onChange);
    };
  }, [key]);
  const saved = useSyncExternalStore(subscribe, () => readView(key), () => null);

  const choose = useCallback((view: AssessmentView) => {
    if (!key) return;
    volatile.set(key, view);
    try {
      window.localStorage.setItem(key, view);
    } catch {
      // Kept for this visit only.
    }
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: key }));
  }, [key]);

  return [saved ?? (mobile ? "cards" : "table"), choose] as const;
}
