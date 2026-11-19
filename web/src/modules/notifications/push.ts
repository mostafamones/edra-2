import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";

import { browserScopeGeneration } from "@/lib/browser-scope";
import { createClient } from "@/lib/supabase/client";
import { loadPushPublicKey } from "./actions";
import { base64url, fromBase64url, pushEndpointAllowed, pushKeysValid } from "./webpush";

export const PUSH_WORKER_URL = "/notifications-sw.js";
export type PushStatus = "checking" | "unsupported" | "unconfigured" | "denied" | "off" | "on" | "error";

export function pushSupported() {
  return typeof window !== "undefined" && window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

const stateSchema = z.object({ state: z.enum(["mine", "other", "none"]) });
type Rpc = ReturnType<typeof createClient>["rpc"];
async function rpc(run: (rpc: Rpc) => PromiseLike<{ data: unknown; error: unknown }>) {
  const db = createClient();
  const { data, error } = await run(db.rpc.bind(db) as Rpc);
  if (error) throw error;
  return data;
}
const keysOf = (subscription: PushSubscription) => {
  const json = subscription.toJSON();
  return { endpoint: subscription.endpoint, p256dh: json.keys?.p256dh?.replace(/=+$/, "") ?? "", auth: json.keys?.auth?.replace(/=+$/, "") ?? "" };
};
const sameKey = (subscription: PushSubscription, publicKey: string) => {
  const key = subscription.options?.applicationServerKey;
  return !key || base64url(new Uint8Array(key)) === publicKey;
};

/** Drops this browser's subscription locally and on the server, and closes previews it displayed. */
async function release(registration: ServiceWorkerRegistration, subscription: PushSubscription, current: () => boolean) {
  if (!current()) return;
  const { endpoint, auth } = keysOf(subscription);
  await rpc((call) => call("release_push_subscription", { p_endpoint: endpoint, p_auth: auth })).catch(() => undefined);
  if (!current()) return;
  await subscription.unsubscribe().catch(() => false);
  if (!current()) return;
  const notifications = await registration.getNotifications().catch(() => []);
  if (current()) for (const shown of notifications) shown.close();
}

/**
 * Current state of this browser for the signed-in account, without prompting. A subscription held
 * for another account, expired on the server or made with an old key is released here.
 */
async function detectPush(current: () => boolean): Promise<{ status: PushStatus; key: string | null }> {
  if (!pushSupported()) return { status: "unsupported", key: null };
  try {
    const key = await loadPushPublicKey();
    if (!current()) return { status: "checking", key: null };
    if (!key) return { status: "unconfigured", key };
    const registration = await navigator.serviceWorker.getRegistration("/");
    if (!current()) return { status: "checking", key: null };
    const subscription = await registration?.pushManager.getSubscription();
    if (!current()) return { status: "checking", key: null };
    if (registration && subscription) {
      const { endpoint, auth } = keysOf(subscription);
      const { state } = stateSchema.parse(await rpc((call) => call("push_subscription_state", { p_endpoint: endpoint, p_auth: auth })));
      if (!current()) return { status: "checking", key: null };
      if (state === "mine" && sameKey(subscription, key) && Notification.permission === "granted") return { status: "on", key };
      await release(registration, subscription, current);
    }
    return { status: Notification.permission === "denied" ? "denied" : "off", key };
  } catch {
    return { status: "error", key: null };
  }
}

/**
 * Explicit per-browser opt-in. Detection never prompts; `enable` must run from a user gesture and
 * asks for permission first. A subscription this browser holds for another account (shared browser,
 * account switch) is released and its displayed previews closed. Results for a previous account are ignored.
 */
export function usePushSubscription(userId: string) {
  const [status, setStatus] = useState<PushStatus>(() => pushSupported() ? "checking" : "unsupported");
  const [busy, setBusy] = useState(false);
  const key = useRef<string | null>(null);
  const generation = useRef(0);

  const check = useCallback(() => {
    const run = ++generation.current;
    const scope = browserScopeGeneration();
    const current = () => run === generation.current && scope === browserScopeGeneration();
    void detectPush(current).then((result) => {
      if (!current()) return;
      key.current = result.key;
      setStatus(result.status);
    });
  }, []);

  useEffect(() => {
    check();
    const run = generation;
    return () => { run.current += 1; };
  }, [check, userId]);

  const enable = useCallback(async () => {
    const publicKey = key.current;
    if (!publicKey || !pushSupported()) return;
    const run = ++generation.current;
    const scope = browserScopeGeneration();
    const current = () => run === generation.current && scope === browserScopeGeneration();
    setBusy(true);
    try {
      // First await in the gesture: browsers require the permission request to come from it.
      const permission = await Notification.requestPermission();
      if (!current()) return;
      if (permission !== "granted") { setStatus(permission === "denied" ? "denied" : "off"); return; }
      const registration = await navigator.serviceWorker.register(PUSH_WORKER_URL, { scope: "/" });
      if (!current()) return;
      await navigator.serviceWorker.ready;
      if (!current()) return;
      let subscription = await registration.pushManager.getSubscription();
      if (!current()) return;
      if (subscription && !sameKey(subscription, publicKey)) {
        await subscription.unsubscribe();
        if (!current()) return;
        subscription = null;
      }
      subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromBase64url(publicKey) });
      if (!current()) return;
      const keys = keysOf(subscription);
      if (!pushEndpointAllowed(keys.endpoint) || !pushKeysValid(keys)) { await subscription.unsubscribe(); throw new Error("Unsupported push service"); }
      await rpc((call) => call("register_push_subscription", { p_endpoint: keys.endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth }));
      if (current()) setStatus("on");
    } catch {
      if (current()) setStatus("error");
    } finally {
      if (current()) setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    const run = ++generation.current;
    const scope = browserScopeGeneration();
    const current = () => run === generation.current && scope === browserScopeGeneration();
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      if (!current()) return;
      const subscription = await registration?.pushManager.getSubscription();
      if (!current()) return;
      if (registration && subscription) await release(registration, subscription, current);
      if (current()) setStatus("off");
    } catch {
      if (current()) setStatus("error");
    } finally {
      if (current()) setBusy(false);
    }
  }, []);

  const recheck = useCallback(() => { setStatus("checking"); check(); }, [check]);
  return { status, busy, enable, disable, check: recheck };
}
