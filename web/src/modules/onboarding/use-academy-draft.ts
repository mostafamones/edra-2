"use client";

import { useCallback, useSyncExternalStore } from "react";

import { type AcademyDraft, readAcademyDraft } from "./academy-draft";

const STORAGE_PREFIX = "edra_academy_creation_draft_v2:";
const CHANGE_EVENT = "edra:academy-draft-change";
const SERVER_SNAPSHOT = "__server__";
const EMPTY_SNAPSHOT = "__empty__";
const volatileDrafts = new Map<string, string>();

function broadcastChange(key: string) {
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: key }));
}

export function useAcademyDraft(userId: string) {
  const key = `${STORAGE_PREFIX}${userId}`;

  const subscribe = useCallback((callback: () => void) => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === key) {
        if (event.newValue === null) volatileDrafts.delete(key);
        else volatileDrafts.set(key, event.newValue);
        callback();
      }
    };
    const onChange = (event: Event) => {
      if ((event as CustomEvent<string>).detail === key) callback();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGE_EVENT, onChange);
    };
  }, [key]);

  const snapshot = useCallback(() => {
    try {
      return window.localStorage.getItem(key) ?? volatileDrafts.get(key) ?? EMPTY_SNAPSHOT;
    } catch {
      return volatileDrafts.get(key) ?? EMPTY_SNAPSHOT;
    }
  }, [key]);

  const raw = useSyncExternalStore(subscribe, snapshot, () => SERVER_SNAPSHOT);
  const draft = readAcademyDraft(raw === SERVER_SNAPSHOT || raw === EMPTY_SNAPSHOT ? null : raw);

  const update = (change: Partial<AcademyDraft>) => {
    const value = JSON.stringify({ ...readAcademyDraft(snapshot()), ...change });
    volatileDrafts.set(key, value);
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Editing remains available when browser storage is blocked.
    }
    broadcastChange(key);
  };

  const clear = () => {
    volatileDrafts.delete(key);
    try {
      window.localStorage.removeItem(key);
    } catch {
      // There may be no persistent browser storage to clear.
    }
    broadcastChange(key);
  };

  return { draft, ready: raw !== SERVER_SNAPSHOT, update, clear };
}
