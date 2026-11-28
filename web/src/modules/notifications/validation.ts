import { z } from "zod";

export const NOTIFICATION_KINDS = ["concern_added", "concern_message", "concern_mention", "concern_settled", "concern_reopened"] as const;
const timestamp = z.string();

/** One in-app notification as the server resolves it now: current title, current message preview. */
export const notificationItemSchema = z.object({
  id: z.guid(), kind: z.enum(NOTIFICATION_KINDS), academyId: z.guid(), concernId: z.guid(), concernTitle: z.string(),
  messageId: z.guid().nullable(), actorName: z.string().nullable(), createdAt: timestamp, readAt: timestamp.nullable(),
  body: z.string().nullable(), media: z.object({ count: z.number().int(), voice: z.boolean() }).nullable(), deleted: z.boolean(),
});
export type NotificationItem = z.infer<typeof notificationItemSchema>;
export const notificationPageSchema = z.object({ items: z.array(notificationItemSchema), hasMore: z.boolean() });
export type NotificationPage = z.infer<typeof notificationPageSchema>;
export const notificationUnreadSchema = z.object({ count: z.number().int() });

/** What the Worker sends to the service worker: display text and a same-origin target, no ids beyond it. */
export const pushMessageSchema = z.object({
  v: z.literal(1), id: z.guid(), title: z.string(), body: z.string(), tag: z.string(), url: z.string().startsWith("/"),
});
export type PushMessage = z.infer<typeof pushMessageSchema>;

export const pushRegistrationInput = z.object({
  endpoint: z.string().min(1).max(2048), p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100),
});
