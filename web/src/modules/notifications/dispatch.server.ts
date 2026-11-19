import "@tanstack/react-start/server-only";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { publicEnv } from "@/lib/env/public";
import { staffAcademyPath } from "@/lib/routing";
import type { Database } from "@/lib/supabase/database.types";
import { notificationText } from "./text";
import { notificationItemSchema, type PushMessage } from "./validation";
import { sendWebPush, vapidValid, type VapidConfig } from "./webpush";

/**
 * Trusted push dispatch. The database leases due deliveries and judges each against CURRENT
 * membership, participation, mute, focus, read state and message deletion; this only encrypts,
 * sends and reports outcomes. Nothing here can affect the concern action that queued it.
 */
export function vapidConfig(): VapidConfig | null {
  const config = { publicKey: process.env.WEB_PUSH_VAPID_PUBLIC_KEY ?? "", privateKey: process.env.WEB_PUSH_VAPID_PRIVATE_KEY ?? "", subject: process.env.WEB_PUSH_SUBJECT ?? "" };
  return vapidValid(config) ? config : null;
}
function serviceDb() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return key ? createClient<Database>(publicEnv.supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

const claimSchema = z.array(z.object({
  deliveryId: z.guid(), endpoint: z.string(), p256dh: z.string(), auth: z.string(), academySlug: z.string(), notification: notificationItemSchema,
}));
type Claimed = z.infer<typeof claimSchema>[number];

const clip = (value: string, max: number) => value.length > max ? `${value.slice(0, max - 1)}…` : value;

/** Display text and a same-origin activation path; the click rechecks access before showing anything. */
export function pushMessage({ academySlug, notification: item }: Pick<Claimed, "academySlug" | "notification">): PushMessage {
  const { action, preview } = notificationText(item);
  const search = new URLSearchParams({ concern: item.concernId, ...(item.messageId && { message: item.messageId }), notification: item.id });
  return {
    v: 1, id: item.id, title: clip(item.concernTitle, 120), body: clip(preview ? `${action}: ${preview}` : action, 240),
    tag: `concern:${item.concernId}`, url: `${staffAcademyPath(academySlug)}?${search}`,
  };
}

/** One leased batch. Returns how many deliveries were claimed (0 when idle or unconfigured). */
export async function dispatchNotifications(limit = 20, send: typeof fetch = fetch): Promise<number> {
  const config = vapidConfig();
  const db = serviceDb();
  if (!config || !db) return 0;
  let batch: Claimed[];
  try {
    const { data, error } = await db.rpc("claim_notification_deliveries", { p_limit: limit });
    if (error) return 0;
    batch = claimSchema.parse(data);
  } catch { return 0; }
  await Promise.all(batch.map(async (entry) => {
    let result;
    try {
      result = await sendWebPush(entry.endpoint, entry, JSON.stringify(pushMessage(entry)), config,
        { ttl: 3600, urgency: entry.notification.kind === "concern_message" ? "normal" : "high" }, send);
    } catch { result = { outcome: "failed" as const, status: null, retryAfter: null }; }
    // A lost report leaves the lease to expire; the next run retries within the attempt limit.
    await db.rpc("complete_notification_delivery", {
      p_delivery_id: entry.deliveryId, p_outcome: result.outcome, p_status: result.status ?? undefined, p_retry_after: result.retryAfter ?? undefined,
    }).then(() => undefined, () => undefined);
  }));
  return batch.length;
}

/** Scheduled and post-command dispatch: up to `rounds` full batches. */
export async function runNotificationDispatch(rounds = 5, limit = 20) {
  let claimed = 0;
  for (let round = 0; round < rounds; round++) {
    const count = await dispatchNotifications(limit);
    claimed += count;
    if (count < limit) break;
  }
  return claimed;
}
