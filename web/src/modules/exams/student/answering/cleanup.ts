"use client";

import { purgeBreadcrumbs } from "../departures/breadcrumb";
import { indexedDbJournal, purgeJournals } from "./journal";

let account: string | null | undefined;
let cleanup: Promise<void> = Promise.resolve();
const listeners = new Set<(next: string | null) => void>();
// The account whose editor tokens this tab holds. A reload starts with no known account, so the
// tokens survive only when the same account is established again.
const TOKEN_OWNER = "edra:exam-editor-account";

/**
 * Called outside the answering mount, including before a normal POST sign-out leaves the page.
 * Listeners receive the new account; the first call after a page load reports the account even
 * when it is unchanged, so mounted material compares it with its own account.
 */
export function setExamJournalAccount(next: string | null) {
  if (next === account) return cleanup;
  account = next;
  purgeBreadcrumbs(next);
  for (const stop of listeners) stop(next);
  try {
    if (window.sessionStorage.getItem(TOKEN_OWNER) !== next) {
      for (const key of Object.keys(window.sessionStorage)) {
        if (key.startsWith("edra:exam-editor:")) window.sessionStorage.removeItem(key);
      }
    }
    if (next) window.sessionStorage.setItem(TOKEN_OWNER, next);
    else window.sessionStorage.removeItem(TOKEN_OWNER);
  } catch { /* Storage may be blocked. */ }
  cleanup = cleanup.then(() => purgeJournals(indexedDbJournal, next)).catch(() => { /* Browser storage may be blocked. */ });
  return cleanup;
}

export function onExamAccountChange(stop: (next: string | null) => void) {
  listeners.add(stop);
  return () => { listeners.delete(stop); };
}

/** Capture every native sign-out form, including menus outside the exam screen. */
export function installExamSignOutCleanup() {
  const submit = (event: SubmitEvent) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || new URL(form.action, location.href).pathname !== "/auth/signout") return;
    event.preventDefault();
    void setExamJournalAccount(null).finally(() => HTMLFormElement.prototype.submit.call(form));
  };
  document.addEventListener("submit", submit, true);
  return () => document.removeEventListener("submit", submit, true);
}
