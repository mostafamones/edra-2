import "@tanstack/react-start/server-only";

import type { ConcernFailure } from "./errors";
import { concernFailure } from "./errors";
import { runConcernCommand } from "./server";
import {
  concernMessageSchema, createConcernInput, deleteMessageInput, editMessageInput, markReadInput, reactionInput, sendMessageInput,
  type ConcernMessage,
} from "./validation";
import { z } from "zod";

export type ConcernMessageResult = { ok: true; message: ConcernMessage } | ConcernFailure;
export type CreateConcernResult = { ok: true; concernId: string; message: ConcernMessage } | ConcernFailure;
export type MarkReadResult = { ok: true; lastReadSeq: number; readAt: string | null } | ConcernFailure;

const toMessage = (data: unknown) => ({ ok: true as const, message: concernMessageSchema.parse(data) });

/**
 * Minimum creation for messaging (Owner, Head Admin, Admin). Ids are chosen by the caller, so a
 * retried request returns the concern and opening message it already created.
 */
export async function createConcern(value: unknown): Promise<CreateConcernResult> {
  const parsed = createConcernInput.safeParse(value);
  if (!parsed.success) return concernFailure("validation");
  const v = parsed.data;
  return runConcernCommand((db) => db.rpc("create_concern", {
    p_academy_id: v.academyId, p_concern_id: v.concernId, p_message_id: v.messageId, p_title: v.title, p_body: v.body,
    p_participant_ids: v.participantIds, p_whole_team: v.wholeTeam, p_mentions: v.mentions,
  }), (data) => {
    const result = z.object({ concernId: z.string(), message: concernMessageSchema }).parse(data);
    return { ok: true as const, ...result };
  });
}

/** Retry with the same `messageId`: the original message comes back, never a duplicate. */
export async function sendConcernMessage(value: unknown): Promise<ConcernMessageResult> {
  const parsed = sendMessageInput.safeParse(value);
  if (!parsed.success) return concernFailure("validation");
  const v = parsed.data;
  return runConcernCommand((db) => db.rpc("send_concern_message", {
    p_academy_id: v.academyId, p_concern_id: v.concernId, p_message_id: v.messageId, p_body: v.body,
    p_reply_to_id: v.replyToId ?? undefined, p_mentions: v.mentions,
  }), toMessage);
}

/** The author's own message, within five minutes of sending by the database clock. */
export async function editConcernMessage(value: unknown): Promise<ConcernMessageResult> {
  const parsed = editMessageInput.safeParse(value);
  if (!parsed.success) return concernFailure("validation");
  const v = parsed.data;
  return runConcernCommand((db) => db.rpc("edit_concern_message", {
    p_academy_id: v.academyId, p_concern_id: v.concernId, p_message_id: v.messageId, p_body: v.body, p_mentions: v.mentions,
  }), toMessage);
}

export async function deleteConcernMessage(value: unknown): Promise<ConcernMessageResult> {
  const parsed = deleteMessageInput.safeParse(value);
  if (!parsed.success) return concernFailure("validation");
  const v = parsed.data;
  return runConcernCommand((db) => db.rpc("delete_concern_message", {
    p_academy_id: v.academyId, p_concern_id: v.concernId, p_message_id: v.messageId,
  }), toMessage);
}

export async function setConcernReaction(value: unknown): Promise<ConcernMessageResult> {
  const parsed = reactionInput.safeParse(value);
  if (!parsed.success) return concernFailure("validation");
  const v = parsed.data;
  return runConcernCommand((db) => db.rpc("set_concern_reaction", {
    p_academy_id: v.academyId, p_concern_id: v.concernId, p_message_id: v.messageId, p_emoji: v.emoji, p_on: v.on,
  }), toMessage);
}

/** Moves the caller's receipt forward (never back). Allowed on settled concerns. */
export async function markConcernRead(value: unknown): Promise<MarkReadResult> {
  const parsed = markReadInput.safeParse(value);
  if (!parsed.success) return concernFailure("validation");
  const v = parsed.data;
  return runConcernCommand((db) => db.rpc("mark_concern_read", { p_academy_id: v.academyId, p_concern_id: v.concernId, p_seq: v.seq }),
    (data) => ({ ok: true as const, ...z.object({ lastReadSeq: z.number().int(), readAt: z.string().nullable() }).parse(data) }));
}
