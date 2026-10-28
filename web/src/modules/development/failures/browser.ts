import { parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";

import { authCookieOptions } from "@/lib/supabase/cookie-policy";

import { FAILURE_CHANGE_EVENT, FAILURE_COOKIE, failureResponse, operationOf, readArm, type Arm } from "./shared";

const HELD = "edra-dev-failure-held";
const observed = new Map<string, Set<string>>();

const cookieValue = () => parseCookieHeader(document.cookie).find(({ name }) => name === FAILURE_COOKIE)?.value ?? null;
const changed = () => window.dispatchEvent(new Event(FAILURE_CHANGE_EVENT));

export const currentArm = (): Arm | null => (typeof document === "undefined" ? null : readArm(cookieValue()));

/** Operations this tab's browser client made on a page. */
export const browserOperations = (page: string) => [...(observed.get(page) ?? [])];

function writeCookie(value: string, maxAge: number) {
  const { domain, secure } = authCookieOptions();
  document.cookie = serializeCookieHeader(FAILURE_COOKIE, value, { domain, path: "/", sameSite: "lax", secure, maxAge });
}

/** Disarms locally, without the app or the server; the recovery path when everything else fails. */
export function clearFailure() {
  if (typeof document === "undefined") return;
  writeCookie("", 0);
  try {
    sessionStorage.removeItem(HELD);
  } catch {
    // Storage unavailable: nothing is held.
  }
  changed();
}

/**
 * Keeps an armed failure in the tab that armed it: a hidden tab holds the cookie in session storage,
 * so requests from other tabs are not failed, and restores it when it becomes visible again.
 */
export function installTabScope() {
  const sync = () => {
    try {
      const value = cookieValue();
      if (document.visibilityState === "hidden") {
        if (value) {
          sessionStorage.setItem(HELD, value);
          writeCookie("", 0);
        }
      } else {
        const held = sessionStorage.getItem(HELD);
        sessionStorage.removeItem(HELD);
        if (held && !value) writeCookie(held, 2 * 60 * 60);
      }
    } catch {
      return;
    }
    changed();
  };
  sync();
  document.addEventListener("visibilitychange", sync);
  return () => document.removeEventListener("visibilitychange", sync);
}

/** The server verifies the arm and counts the trigger, so once-only means once across server and browser. */
async function shouldFail(arm: Arm) {
  try {
    const response = await fetch("/api/development/failures", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", cache: "no-store",
      body: JSON.stringify({ action: "trigger", id: arm.id }),
    });
    return response.ok && (await response.json()).fail === true;
  } catch {
    return false;
  }
}

/** Browser Supabase fetch: records operations and fails the armed one before it leaves the browser. */
export const failureFetch: typeof fetch = async (input, init) => {
  const request = input instanceof Request ? input : null;
  const operation = operationOf(request?.url ?? String(input), init?.method ?? request?.method);
  if (operation) {
    const page = window.location.pathname;
    if (!observed.has(page)) observed.set(page, new Set());
    observed.get(page)!.add(operation);
    const arm = currentArm();
    if (arm?.operation === operation && await shouldFail(arm)) {
      changed();
      return failureResponse(arm.kind);
    }
  }
  return fetch(input, init);
};
