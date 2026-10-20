"use client";

import { purgeBreadcrumbs } from "../departures/breadcrumb";
import { indexedDbJournal, purgeJournals } from "./journal";

let account: string | null | undefined;
let cleanup: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();

/** Called outside the answering mount, including before a normal POST sign-out leaves the page. */
export function setExamJournalAccount(next: string | null) {
  if (next === account) return cleanup;
  account = next;
  purgeBreadcrumbs(next);
  for (const stop of listeners) stop();
  try {
    for (const key of Object.keys(window.sessionStorage)) {
      if (key.startsWith("edra:exam-editor:")) window.sessionStorage.removeItem(key);
    }
  } catch { /* Storage may be blocked. */ }
  cleanup = cleanup.then(() => purgeJournals(indexedDbJournal, next)).catch(() => { /* Browser storage may be blocked. */ });
  return cleanup;
}

export function onExamAccountChange(stop: () => void) {
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
