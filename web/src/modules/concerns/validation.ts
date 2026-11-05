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

const attachmentSchema = z.object({
  id: z.string(), name: z.string(), contentType: z.string(), bytes: z.number().int().max(CONCERN_LIMITS.attachmentBytes),
  kind: z.enum(["file", "voice"]), durationSeconds: z.number().max(CONCERN_LIMITS.voiceSeconds).nullable(),
});

export const concernMessageSchema = z.object({
  id: z.string(), concernId: z.string(), seq: z.number().int(), revision: z.number().int(),
  authorId: z.string(), authorName: z.string().nullable(),
  /** Null once deleted: show the "Message deleted" placeholder. */
  body: z.string().nullable(),
  mentions: z.array(z.string()),
  createdAt: timestamp, editedAt: timestamp.nullable(), deletedAt: timestamp.nullable(),
  replyTo: z.object({
    id: z.string(), seq: z.number().int(), authorId: z.string(), authorName: z.string().nullable(),
    body: z.string().nullable(), deleted: z.boolean(),
  }).nullable(),
  reactions: z.array(z.object({ emoji: z.string(), userIds: z.array(z.string()) })),
  attachments: z.array(attachmentSchema),
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
      deleted: z.boolean(), createdAt: timestamp }).nullable(),
  })),
});
export type ConcernInboxPage = z.infer<typeof concernInboxSchema>;
export type ConcernInboxEntry = ConcernInboxPage["concerns"][number];

export const concernUnreadSchema = z.object({ concerns: z.number().int(), messages: z.number().int(), mentions: z.number().int() });
export type ConcernUnread = z.infer<typeof concernUnreadSchema>;

/** A concern title match has no message fields. */
export const concernSearchSchema = z.array(z.object({
  concernId: z.string(), title: z.string(), status, messageId: z.string().nullable(), seq: z.number().int().nullable(),
  body: z.string().nullable(), authorName: z.string().nullable(), createdAt: timestamp,
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
export const sendMessageInput = target.extend({ messageId: z.guid(), body: concernBodySchema, replyToId: z.guid().nullable(), mentions: ids });
export const editMessageInput = target.extend({ messageId: z.guid(), body: concernBodySchema, mentions: ids });
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

export type CreateConcernInput = z.infer<typeof createConcernInput>;
export type SendMessageInput = z.infer<typeof sendMessageInput>;
export type EditMessageInput = z.infer<typeof editMessageInput>;
export type DeleteMessageInput = z.infer<typeof deleteMessageInput>;
export type ReactionInput = z.infer<typeof reactionInput>;
export type MarkReadInput = z.infer<typeof markReadInput>;
export type AddParticipantsInput = z.infer<typeof addParticipantsInput>;
export type RemoveParticipantInput = z.infer<typeof removeParticipantInput>;
export type SettleInput = z.infer<typeof settleInput>;
export type ReopenInput = z.infer<typeof reopenInput>;
export type RecoverInput = z.infer<typeof recoverInput>;
