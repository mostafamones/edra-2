"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

import {
  defaultPreferences, preferencesKey, sanitizePreferences, writePreferences, type TablePreferences,
} from "./preferences";

const CHANGE_EVENT = "edra:students-table-preferences";
const SERVER_SNAPSHOT = "__server__";
const EMPTY_SNAPSHOT = "__empty__";
// Keeps preferences for this visit when browser storage is blocked.
const volatile = new Map<string, string>();

/**
 * Table preferences for one staff user and academy. Reads happen only after hydration
 * (`hydrated` is false on the server and during the first client render).
 */
export function useTablePreferences(userId: string | undefined, academyId: string) {
  const key = userId ? preferencesKey(userId, academyId) : null;

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

  const snapshot = useCallback(() => {
    if (!key) return EMPTY_SNAPSHOT;
    try {
      return window.localStorage.getItem(key) ?? volatile.get(key) ?? EMPTY_SNAPSHOT;
    } catch {
      return volatile.get(key) ?? EMPTY_SNAPSHOT;
    }
  }, [key]);

  const raw = useSyncExternalStore(subscribe, snapshot, () => SERVER_SNAPSHOT);
  const hydrated = raw !== SERVER_SNAPSHOT;
  const preferences = useMemo<TablePreferences>(() => {
    if (raw === SERVER_SNAPSHOT || raw === EMPTY_SNAPSHOT) return defaultPreferences();
    try {
      return sanitizePreferences(JSON.parse(raw));
    } catch {
      return defaultPreferences();
    }
  }, [raw]);

  const update = useCallback((change: (current: TablePreferences) => TablePreferences) => {
    if (!key) return;
    let current = defaultPreferences();
    try {
      const stored = snapshot();
      if (stored !== EMPTY_SNAPSHOT) current = sanitizePreferences(JSON.parse(stored));
    } catch {
      // Unreadable values are replaced below.
    }
    const next = sanitizePreferences(change(current));
    volatile.set(key, JSON.stringify(next));
    writePreferences(window.localStorage, key, next);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: key }));
  }, [key, snapshot]);

  return { preferences, hydrated, update };
}
