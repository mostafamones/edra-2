import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { cookies, headers } from "next/headers";

import { PUBLIC_PATH_HEADER } from "@/lib/routing";

import { CONTROL_COOKIE, developmentConfig } from "../config";
import { FAILURE_COOKIE, failureResponse, operationOf, readArm, type Arm } from "./shared";

type CookieStore = Awaited<ReturnType<typeof cookies>>;

// shortcut: in-memory state of one dev server process; restart clears triggers and observed operations.
export const failureState = ((globalThis as { __edraFailures?: { triggered: Map<string, number>; observed: Map<string, Set<string>> } })
  .__edraFailures ??= { triggered: new Map(), observed: new Map() });
const MAX_PAGES = 300;

export function signature(key: Buffer, payload: string, controlToken: string) {
  const control = createHash("sha256").update(controlToken).digest("base64url");
  return createHmac("sha256", key).update(`edra-dev-failure:v1:${payload}:${control}`).digest("base64url");
}

/** The arm in the cookie when this server signed it for the preview control the request still carries. */
export function verifiedArm(store: CookieStore): Arm | null {
  const config = developmentConfig();
  const control = store.get(CONTROL_COOKIE)?.value;
  const [payload, sent] = store.get(FAILURE_COOKIE)?.value.split(".") ?? [];
  if (!config || !control || !payload || !sent) return null;
  const expected = Buffer.from(signature(config.key, payload, control));
  const actual = Buffer.from(sent);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return readArm(payload);
}

/** Atomically counts a trigger; a once-only arm fails only its first matching request. */
export function trigger(arm: Arm) {
  const count = failureState.triggered.get(arm.id) ?? 0;
  if (arm.mode === "once" && count > 0) return false;
  failureState.triggered.set(arm.id, count + 1);
  return true;
}

function observe(page: string, operation: string) {
  let operations = failureState.observed.get(page);
  if (!operations) {
    if (failureState.observed.size >= MAX_PAGES) failureState.observed.delete(failureState.observed.keys().next().value!);
    failureState.observed.set(page, operations = new Set());
  }
  operations.add(operation);
}

/**
 * Supabase fetch for this request while a Developer mode preview is open in development, else undefined.
 * It records the page's operations and fails the armed one before it reaches Supabase, so no write happens.
 */
export async function failureFetch(store: CookieStore): Promise<typeof fetch | undefined> {
  if (process.env.NODE_ENV === "production" || !store.get(CONTROL_COOKIE) || !developmentConfig()) return undefined;
  let page: string;
  try {
    const list = await headers();
    // Router prefetches are speculative; they must neither consume nor reveal an armed failure.
    if (list.get("next-router-prefetch")) return undefined;
    page = (list.get(PUBLIC_PATH_HEADER) ?? "/").split("?")[0];
  } catch {
    return undefined;
  }
  const arm = verifiedArm(store);
  return async (input, init) => {
    const request = input instanceof Request ? input : null;
    const operation = operationOf(request?.url ?? String(input), init?.method ?? request?.method);
    if (operation) observe(page, operation);
    if (arm && operation === arm.operation && trigger(arm)) return failureResponse(arm.kind);
    return fetch(input, init);
  };
}
