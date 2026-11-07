import { concernFailure } from "./errors";
import { concernMediaSummary } from "./media";
import type { ConcernMessage, ConcernThread } from "./validation";

/** Typing shows for this long after the last presence update, so a stalled client cannot pin it on. */
export const TYPING_TTL_MS = 6000;

/**
 * Upserts messages into the loaded window. The higher revision always wins, so a late or repeated
 * response can never roll a message back. Changes to messages older than the loaded window are
 * dropped (that page loads them fresh), keeping the window contiguous.
 */
export function mergeMessages(thread: ConcernThread, incoming: ConcernMessage[]): ConcernThread {
  if (incoming.length === 0) return thread;
  const oldest = thread.hasMore ? thread.messages[0]?.seq ?? Infinity : -Infinity;
  const byId = new Map(thread.messages.map((message) => [message.id, message]));
  let changed = false;
  for (const message of incoming) {
    const current = byId.get(message.id);
    if (current ? current.revision >= message.revision : message.seq < oldest) continue;
    byId.set(message.id, message);
    changed = true;
  }
  // A changed parent may be older than our window. Its quotes still need updating, even though
  // the parent itself is not inserted into this contiguous window. Never restore a deleted quote.
  const parents = new Map(incoming.map((message) => [message.id, byId.get(message.id) ?? message]));
  for (const [id, message] of byId) {
    const quote = message.replyTo;
    const parent = quote && parents.get(quote.id);
    if (!quote || !parent || (quote.deleted && !parent.deletedAt)) continue;
    const deleted = parent.deletedAt !== null;
    const media = deleted ? null : concernMediaSummary(parent.attachments);
    if (quote.body === parent.body && quote.deleted === deleted && quote.authorName === parent.authorName
      && quote.media?.count === media?.count && quote.media?.voice === media?.voice) continue;
    byId.set(id, { ...message, replyTo: { ...quote, body: parent.body, deleted, authorName: parent.authorName, media } });
    changed = true;
  }
  if (!changed) return thread;
  return { ...thread, messages: [...byId.values()].sort((a, b) => a.seq - b.seq) };
}

/** Applies a `concern_message_changes` batch and moves the cursor forward (never back). */
export function applyChanges(thread: ConcernThread, changes: { messages: ConcernMessage[]; cursor: number }): ConcernThread {
  const merged = mergeMessages(thread, changes.messages);
  return changes.cursor > merged.cursor ? { ...merged, cursor: changes.cursor } : merged;
}

/** Prepends an older page. Messages already present keep their newer revision. */
export function prependOlder(thread: ConcernThread, page: ConcernThread): ConcernThread {
  const merged = mergeMessages({ ...thread, hasMore: false }, page.messages);
  return { ...merged, hasMore: page.hasMore };
}

/**
 * Who is typing now. Presence is client-supplied, so it never grants anything: only current
 * participants are shown, the viewer is excluded, and entries expire on the viewer's own clock.
 */
export function activeTypers(seen: ReadonlyMap<string, number>, participantIds: ReadonlySet<string>, selfId: string, now: number): string[] {
  return [...seen].filter(([userId, at]) => userId !== selfId && participantIds.has(userId) && now - at < TYPING_TTL_MS)
    .map(([userId]) => userId).sort();
}

const RETRY_DELAYS_MS = [500, 1500];

/**
 * Retries a command only while the server was unreachable. Each attempt must reuse the same ids so
 * the database returns the original result instead of repeating the write.
 */
export async function withRetry<T extends { ok: boolean; code?: string }>(attempt: () => Promise<T>,
  wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))): Promise<T> {
  const unreachable = () => concernFailure("unavailable") as unknown as T;
  let result = await attempt().catch(unreachable);
  for (const delay of RETRY_DELAYS_MS) {
    if (result.ok || result.code !== "unavailable") break;
    await wait(delay);
    result = await attempt().catch(unreachable);
  }
  return result;
}
