/** Shared concern contracts. Database commands remain the authority for all capabilities. */
export const CONCERN_LIMITS = {
  editWindowSeconds: 300,
  attachmentsPerMessage: 10,
  attachmentBytes: 25 * 1024 * 1024,
  voiceSeconds: 300,
} as const;

export type ConcernStatus = "ongoing" | "settled";
export type ConcernEventKind =
  | "created" | "participant_added" | "participant_removed" | "owner_recovered"
  | "settled" | "reopened" | "message_sent" | "message_edited" | "message_deleted"
  | "reaction_changed" | "read_updated";

/** A durable event identity lets delivery adapters deduplicate without coupling writes to push. */
export type ConcernEvent = {
  id: string;
  academyId: string;
  concernId: string;
  actorId: string;
  kind: ConcernEventKind;
  messageId?: string;
  occurredAt: string;
};

/** Media is always resolved through an authorized endpoint; never store public delivery URLs. */
export type ConcernAttachment = {
  id: string;
  name: string;
  contentType: string;
  bytes: number;
  kind: "file" | "voice";
  durationSeconds: number | null;
};

/** Notification activation revalidates access before presenting this academy-scoped target. */
export type ConcernTarget = { academyId: string; concernId: string; messageId?: string };
