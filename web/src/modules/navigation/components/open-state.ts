"use client";

import { useSyncExternalStore } from "react";

type OpenMap = Record<string, boolean>;

const KEY = "edra:sidebar-sections";
const EMPTY: OpenMap = {};
const listeners = new Set<() => void>();
let cache: { raw: string | null; value: OpenMap } = { raw: null, value: EMPTY };

function read(): OpenMap {
  let raw: string | null = null;
  try { raw = window.localStorage.getItem(KEY); } catch { /* storage unavailable */ }
  if (raw === cache.raw) return cache.value;
  let value = EMPTY;
  try { if (raw) value = JSON.parse(raw) as OpenMap; } catch { /* ignore corrupt value */ }
  cache = { raw, value };
  return value;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => { listeners.delete(listener); window.removeEventListener("storage", listener); };
}

/** Remembers which sidebar sections the user opened or closed, across navigation and reloads. */
export function useSectionOpenState() {
  const saved = useSyncExternalStore(subscribe, read, () => EMPTY);
  const setSaved = (label: string, open: boolean) => {
    try { window.localStorage.setItem(KEY, JSON.stringify({ ...read(), [label]: open })); } catch { /* storage unavailable */ }
    listeners.forEach((listener) => listener());
  };
  return [saved, setSaved] as const;
}
