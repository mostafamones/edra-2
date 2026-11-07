import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationItem } from "./validation";

const admin = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@tanstack/react-start/server-only", () => ({}));
vi.mock("@/lib/env/public", () => ({ publicEnv: { supabaseUrl: "https://project.supabase.test", appOrigin: "https://app.edra.test", learnOrigin: "https://learn.edra.test", marketingOrigin: "https://edra.test" } }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc: admin.rpc }) }));

const { dispatchNotifications, pushMessage, runNotificationDispatch } = await import("./dispatch.server");
const { base64url } = await import("./webpush");

const ids = { academy: "11111111-1111-4111-8111-111111111111", concern: "22222222-2222-4222-8222-222222222222", message: "33333333-3333-4333-8333-333333333333", notification: "44444444-4444-4444-8444-444444444444" };
const item = (extra: Partial<NotificationItem> = {}): NotificationItem => ({
  id: ids.notification, kind: "concern_message", academyId: ids.academy, concernId: ids.concern, concernTitle: "Late fees", messageId: ids.message,
  actorName: "Mona", createdAt: "2026-11-05T06:00:00Z", readAt: null, body: "Please check the invoice", media: null, deleted: false, ...extra,
});
// RFC 8291 receiver keys: a valid synthetic subscription; nothing is sent to a real person.
const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/synthetic", p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", auth: "BTBZMqHH6r4Tts7J_aSIgg" };
const claimed = (extra: Partial<NotificationItem> = {}, deliveryId = "55555555-5555-4555-8555-555555555555") =>
  ({ deliveryId, ...subscription, endpoint: `${subscription.endpoint}/${deliveryId}`, academySlug: "north", notification: item(extra) });

async function stubVapid() {
  const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]) as CryptoKeyPair;
  vi.stubEnv("WEB_PUSH_VAPID_PUBLIC_KEY", base64url(new Uint8Array(await crypto.subtle.exportKey("raw", keys.publicKey) as ArrayBuffer)));
  vi.stubEnv("WEB_PUSH_VAPID_PRIVATE_KEY", (await crypto.subtle.exportKey("jwk", keys.privateKey)).d!);
  vi.stubEnv("WEB_PUSH_SUBJECT", "mailto:push@edra.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
}
beforeEach(() => { admin.rpc.mockReset(); });
afterEach(() => vi.unstubAllEnvs());

describe("push message", () => {
  it("uses the current message, media label or deletion, and a same-origin academy target", () => {
    expect(pushMessage(claimed())).toEqual({ v: 1, id: ids.notification, title: "Late fees", body: "Mona: Please check the invoice", tag: `concern:${ids.concern}`,
      url: `/north?concern=${ids.concern}&message=${ids.message}&notification=${ids.notification}` });
    expect(pushMessage(claimed({ kind: "concern_mention", body: null, media: { count: 1, voice: true } })).body).toBe("Mona mentioned you: Voice note");
    expect(pushMessage(claimed({ body: null, media: { count: 3, voice: false } })).body).toBe("Mona: 3 attachments");
    expect(pushMessage(claimed({ kind: "concern_settled", messageId: null, body: null })).body).toBe("Mona settled this concern");
    expect(pushMessage(claimed({ kind: "concern_added", messageId: null, body: null, actorName: null })).url).toBe(`/north?concern=${ids.concern}&notification=${ids.notification}`);
    expect(pushMessage(claimed({ body: "x".repeat(400) })).body).toHaveLength(240);
  });
});

describe("dispatch", () => {
  it("does nothing until VAPID keys and the service role are configured", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    expect(await dispatchNotifications()).toBe(0);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("sends each claimed delivery once and reports its outcome; one failure does not stop the batch", async () => {
    await stubVapid();
    const second = "66666666-6666-4666-8666-666666666666";
    const third = "77777777-7777-4777-8777-777777777777";
    admin.rpc.mockImplementation(async (name: string) => name === "claim_notification_deliveries"
      ? { data: [claimed(), claimed({ kind: "concern_mention" }, second), claimed({}, third)], error: null } : { data: null, error: null });
    // Sends run in parallel, so each response is chosen by its endpoint.
    const send = vi.fn(async (url: string) => {
      if (url.endsWith(second)) return new Response(null, { status: 410 });
      if (url.endsWith(third)) throw new TypeError("network");
      return new Response(null, { status: 201 });
    });
    expect(await dispatchNotifications(20, send as unknown as typeof fetch)).toBe(3);
    expect(send).toHaveBeenCalledTimes(3);
    const urgency = (id: string) => (send.mock.calls.find(([url]) => url.endsWith(id)) as unknown as [string, { headers: Record<string, string> }])[1].headers.Urgency;
    expect(urgency(second)).toBe("high");
    expect(urgency(third)).toBe("normal");
    const reports = admin.rpc.mock.calls.filter(([name]) => name === "complete_notification_delivery").map(([, args]) => [args.p_delivery_id, args.p_outcome]);
    expect(reports).toEqual(expect.arrayContaining([["55555555-5555-4555-8555-555555555555", "sent"], [second, "gone"], [third, "retry"]]));
    // Nothing private reaches the request URL or headers in clear text.
    expect(JSON.stringify(send.mock.calls)).not.toContain("invoice");
  });

  it("treats claim failures and malformed claims as idle", async () => {
    await stubVapid();
    admin.rpc.mockResolvedValueOnce({ data: null, error: { message: "down" } });
    expect(await dispatchNotifications()).toBe(0);
    admin.rpc.mockResolvedValueOnce({ data: [{ deliveryId: "x" }], error: null });
    expect(await dispatchNotifications()).toBe(0);
  });

  it("drains full batches up to the round limit", async () => {
    await stubVapid();
    admin.rpc.mockImplementation(async (name: string) => name === "claim_notification_deliveries" ? { data: [], error: null } : { data: null, error: null });
    expect(await runNotificationDispatch(3, 2)).toBe(0);
    expect(admin.rpc.mock.calls.filter(([name]) => name === "claim_notification_deliveries")).toHaveLength(1);
  });
});
