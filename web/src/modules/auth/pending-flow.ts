export type PendingAuthKind = "signup" | "recovery";

type PendingAuthFlow = {
  kind: PendingAuthKind;
  phone: string;
  nextPath?: string;
};

const STORAGE_KEY = "edra_pending_phone_auth";

export function savePendingAuthFlow(flow: PendingAuthFlow) {
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(flow));
}

export function readPendingAuthFlow(kind: PendingAuthKind) {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "null") as PendingAuthFlow | null;
    return value?.kind === kind ? value : null;
  } catch {
    return null;
  }
}

export function clearPendingAuthFlow() {
  window.sessionStorage.removeItem(STORAGE_KEY);
}
