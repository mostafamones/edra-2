export const SESSION_RECOVERY_EVENT = "edra-session-ended";
export type SessionEndReason = "preview";

/** Developer preview expiry is the only client-side condition that blocks the app. */
export function requestSessionRecovery(reason: SessionEndReason) {
  window.dispatchEvent(new CustomEvent(SESSION_RECOVERY_EVENT, { detail: reason }));
}

/** Connectivity failures never masquerade as an expired or revoked session. */
