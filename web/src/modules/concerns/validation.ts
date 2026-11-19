import { z } from "zod";

import { CONCERN_LIMITS } from "./contracts";

export const CONCERN_BODY_MAX = 4000;
export const CONCERN_TITLE_MAX = 120;

/** Same limits the database enforces: not blank, at most 4000 characters. */
export const concernBodySchema = z.string().max(CONCERN_BODY_MAX).refine((value) => value.trim().length > 0);
export const concernTitleSchema = z.string().trim().min(1).max(CONCERN_TITLE_MAX);
/** One emoji (including flags and keycaps), never arbitrary text. */
export const concernEmojiSchema = z.string().min(1).max(16)
  .regex(/^[^\s\p{Cc}]+$/u).regex(/\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u);
const ids = z.array(z.guid()).max(50);

const timestamp = z.string();
const status = z.enum(["ongoing", "settled"]);

export const concernAttachmentSchema = z.object({
  id: z.string(), name: z.string(), contentType: z.string(), bytes: z.number().int().min(1).max(CONCERN_LIMITS.attachmentBytes),
  kind: z.enum(["file", "voice"]), durationSeconds: z.number().positive().max(CONCERN_LIMITS.voiceSeconds).nullable(),
});
/** A live message's media, for previews of quotes, the inbox and search. Null when it has none or was deleted. */
const mediaSummary = z.object({ count: z.number().int().min(1), voice: z.boolean() }).nullable().default(null);
export type ConcernMediaSummary = z.infer<typeof mediaSummary>;

export const concernMessageSchema = z.object({
  id: z.string(), concernId: z.string(), seq: z.number().int(), revision: z.number().int(),
  authorId: z.string(), authorName: z.string().nullable(),
  /** Null once deleted, or for a media-only message. `deletedAt` alone decides the placeholder. */
  body: z.string().nullable(),
  mentions: z.array(z.string()),
  createdAt: timestamp, editedAt: timestamp.nullable(), deletedAt: timestamp.nullable(),
  replyTo: z.object({
    id: z.string(), seq: z.number().int(), authorId: z.string(), authorName: z.string().nullable(),
    body: z.string().nullable(), deleted: z.boolean(), media: mediaSummary,
  }).nullable(),
  reactions: z.array(z.object({ emoji: z.string(), userIds: z.array(z.string()) })),
  attachments: z.array(concernAttachmentSchema).max(CONCERN_LIMITS.attachmentsPerMessage),
});
export type ConcernMessage = z.infer<typeof concernMessageSchema>;

/** A contiguous window of the newest messages. `cursor` is the revision every later change follows. */
export const concernThreadSchema = z.object({ messages: z.array(concernMessageSchema), hasMore: z.boolean(), cursor: z.number().int() });
export type ConcernThread = z.infer<typeof concernThreadSchema>;

export const concernParticipantSchema = z.object({
  suspended: z.boolean().optional(),
  userId: z.string(), name: z.string().nullable(), avatarPath: z.string().nullable(),
  lastReadSeq: z.number().int(), readAt: timestamp.nullable(),
});
export type ConcernParticipant = z.infer<typeof concernParticipantSchema>;

export const concernDetailSchema = z.object({
  id: z.string(), title: z.string(), status, createdAt: timestamp, createdBy: z.string(),
  settledAt: timestamp.nullable(), outcome: z.string().nullable(), lastSeq: z.number().int(), muted: z.boolean(),
  /** Lifecycle version: settle/reopen must name the version they were decided on. */
  version: z.number().int(), settledBy: z.string().nullable(), settledByName: z.string().nullable(),
  /** Presentation only: the database rechecks the current role on every command. */
  canManage: z.boolean(),
  participants: z.array(concernParticipantSchema),
});
export type ConcernDetail = z.infer<typeof concernDetailSchema>;

export const concernInboxSchema = z.object({
  hasMore: z.boolean(),
  concerns: z.array(z.object({
    id: z.string(), title: z.string(), status, updatedAt: timestamp, muted: z.boolean(), lastReadSeq: z.number().int(),
    unread: z.number().int(), unreadMentions: z.number().int(),
    last: z.object({ seq: z.number().int(), authorId: z.string(), authorName: z.string().nullable(), body: z.string().nullable(),
      deleted: z.boolean(), createdAt: timestamp, media: mediaSummary }).nullable(),
  })),
});
export type ConcernInboxPage = z.infer<typeof concernInboxSchema>;
export type ConcernInboxEntry = ConcernInboxPage["concerns"][number];

export const concernUnreadSchema = z.object({ concerns: z.number().int(), messages: z.number().int(), mentions: z.number().int() });
export type ConcernUnread = z.infer<typeof concernUnreadSchema>;

/** A concern title match has no message fields. */
export const concernSearchSchema = z.array(z.object({
  concernId: z.string(), title: z.string(), status, messageId: z.string().nullable(), seq: z.number().int().nullable(),
  body: z.string().nullable(), authorName: z.string().nullable(), createdAt: timestamp, media: mediaSummary,
}));
export type ConcernSearchHit = z.infer<typeof concernSearchSchema>[number];

/** Lifecycle and membership history; `note` is the settlement outcome or reopening reason. */
export const concernHistorySchema = z.array(z.object({
  id: z.string(),
  kind: z.enum(["created", "participant_added", "participant_removed", "owner_recovered", "settled", "reopened"]),
  occurredAt: timestamp, actorId: z.string(), actorName: z.string().nullable(),
  subjectId: z.string().nullable(), subjectName: z.string().nullable(), note: z.string().nullable(),
}));
export type ConcernHistoryEntry = z.infer<typeof concernHistorySchema>[number];

export const concernStateSchema = z.object({ concernId: z.string(), status, version: z.number().int(), recovered: z.boolean().optional() });
export type ConcernState = z.infer<typeof concernStateSchema>;

const target = z.object({ academyId: z.guid(), concernId: z.guid() });
export const createConcernInput = z.object({
  academyId: z.guid(), concernId: z.guid(), messageId: z.guid(), title: concernTitleSchema, body: concernBodySchema,
  participantIds: z.array(z.guid()).max(500), wholeTeam: z.boolean(), mentions: ids,
});
/** Text, media or both. Media are the sender's own verified uploads, bound once by the database. */
export const sendMessageInput = target.extend({
  messageId: z.guid(), body: concernBodySchema.nullable(), replyToId: z.guid().nullable(), mentions: ids,
  attachmentIds: z.array(z.guid()).max(CONCERN_LIMITS.attachmentsPerMessage).default([]),
}).refine((value) => value.body !== null || value.attachmentIds.length > 0)
  .refine((value) => new Set(value.attachmentIds).size === value.attachmentIds.length);
/** Null text is accepted only for a message with media; the database checks that. */
export const editMessageInput = target.extend({ messageId: z.guid(), body: concernBodySchema.nullable(), mentions: ids });
export const deleteMessageInput = target.extend({ messageId: z.guid() });
export const reactionInput = target.extend({ messageId: z.guid(), emoji: concernEmojiSchema, on: z.boolean() });
export const markReadInput = target.extend({ seq: z.number().int().min(0) });
/** Settlement outcomes and reopening reasons share the message limits. */
export const concernNoteSchema = concernBodySchema;
const request = { requestId: z.guid() };
export const addParticipantsInput = target.extend({ ...request, userIds: z.array(z.guid()).min(1).max(50) });
export const removeParticipantInput = target.extend({ ...request, userId: z.guid() });
export const settleInput = target.extend({ ...request, outcome: concernNoteSchema, expectedVersion: z.number().int().min(1) });
export const reopenInput = target.extend({ ...request, reason: concernNoteSchema, expectedVersion: z.number().int().min(1) });
export const recoverInput = target.extend(request);
/** The caller's own notification preference; allowed when settled. */
export const muteInput = target.extend({ muted: z.boolean() });
/** Names are stored as given for display and download; path separators and control characters are refused. */
export const attachmentNameSchema = z.string().trim().min(1).max(255).regex(/^[^/\\\p{Cc}]+$/u);
export const reserveAttachmentInput = target.extend({
  attachmentId: z.guid(), kind: z.enum(["file", "voice"]), name: attachmentNameSchema,
  bytes: z.number().int().min(1).max(CONCERN_LIMITS.attachmentBytes),
});
export const attachmentInput = target.extend({ attachmentId: z.guid() });

export type CreateConcernInput = z.infer<typeof createConcernInput>;
export type SendMessageInput = z.input<typeof sendMessageInput>;
export type ReserveAttachmentInput = z.infer<typeof reserveAttachmentInput>;
export type EditMessageInput = z.infer<typeof editMessageInput>;
export type DeleteMessageInput = z.infer<typeof deleteMessageInput>;
export type ReactionInput = z.infer<typeof reactionInput>;
export type MarkReadInput = z.infer<typeof markReadInput>;
export type AddParticipantsInput = z.infer<typeof addParticipantsInput>;
export type RemoveParticipantInput = z.infer<typeof removeParticipantInput>;
export type SettleInput = z.infer<typeof settleInput>;
export type ReopenInput = z.infer<typeof reopenInput>;
export type RecoverInput = z.infer<typeof recoverInput>;
