import { describe, expect, it, vi } from "vitest";

import { concernFailureFromDatabase } from "./errors";
import { activeTypers, applyChanges, mergeMessages, prependOlder, TYPING_TTL_MS, withRetry } from "./thread";
import { concernEmojiSchema, concernMessageSchema, type ConcernMessage, type ConcernThread } from "./validation";

const message = (seq: number, revision = seq, patch: Partial<ConcernMessage> = {}): ConcernMessage => ({
  id: `m${seq}`, concernId: "c", seq, revision, authorId: "a", authorName: "A", body: `text ${seq}`, mentions: [],
  createdAt: "2026-11-04T10:00:00Z", editedAt: null, deletedAt: null, replyTo: null, reactions: [], attachments: [], ...patch,
});
const thread = (seqs: number[], hasMore: boolean, cursor = Math.max(0, ...seqs)): ConcernThread =>
  ({ messages: seqs.map((seq) => message(seq)), hasMore, cursor });
const seqs = (value: ConcernThread) => value.messages.map((entry) => entry.seq);

describe("thread merging", () => {
  it("appends new messages in seq order without duplicates", () => {
    const merged = mergeMessages(thread([1, 2], false), [message(4), message(3), message(3)]);
    expect(seqs(merged)).toEqual([1, 2, 3, 4]);
  });

  it("keeps the higher revision so late or repeated responses cannot roll back an edit or deletion", () => {
    const deleted = message(2, 9, { body: null, deletedAt: "2026-11-04T10:01:00Z" });
    const after = mergeMessages(mergeMessages(thread([1, 2], false), [deleted]), [message(2, 2)]);
    expect(after.messages[1]).toEqual(deleted);
  });

  it("ignores changes older than a partial window, keeping it contiguous", () => {
    const window = thread([5, 6], true);
    expect(mergeMessages(window, [message(3, 20)])).toBe(window);
    expect(seqs(mergeMessages(thread([1, 2], false), [message(1, 20)]))).toEqual([1, 2]);
  });

  it("advances the cursor only forward", () => {
    const value = thread([1], false, 10);
    expect(applyChanges(value, { messages: [], cursor: 7 }).cursor).toBe(10);
    expect(applyChanges(value, { messages: [message(2, 12)], cursor: 12 }).cursor).toBe(12);
  });

  it("removes cached quote text when an older parent is deleted outside the loaded window", () => {
    const value: ConcernThread = { ...thread([5], true), messages: [message(5, 5, {
      replyTo: { id: "m1", seq: 1, authorId: "a", authorName: "A", body: "private text", deleted: false },
    })] };
    const merged = applyChanges(value, { messages: [message(1, 9, { body: null, deletedAt: "now" })], cursor: 9 });
    expect(seqs(merged)).toEqual([5]);
    expect(merged.messages[0].replyTo).toMatchObject({ body: null, deleted: true });
    expect(mergeMessages(merged, [message(1, 1)]).messages[0].replyTo).toMatchObject({ body: null, deleted: true });
  });

  it("prepends older pages and takes their hasMore", () => {
    const value = prependOlder(thread([3, 4], true), thread([1, 2], false));
    expect(seqs(value)).toEqual([1, 2, 3, 4]);
    expect(value.hasMore).toBe(false);
  });
});

describe("typing", () => {
  it("shows current participants other than the viewer until the entry expires", () => {
    const seen = new Map([["self", 0], ["peer", 0], ["removed", 0]]);
    expect(activeTypers(seen, new Set(["self", "peer"]), "self", TYPING_TTL_MS - 1)).toEqual(["peer"]);
    expect(activeTypers(seen, new Set(["self", "peer"]), "self", TYPING_TTL_MS)).toEqual([]);
  });
});

describe("retry", () => {
  it("retries only unreachable results, then returns the first definitive one", async () => {
    const attempt = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ ok: false, code: "unavailable" })
      .mockResolvedValueOnce({ ok: true });
    await expect(withRetry(attempt, async () => {})).resolves.toEqual({ ok: true });
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it("does not retry refusals", async () => {
    const attempt = vi.fn().mockResolvedValue({ ok: false, code: "edit_expired" });
    await withRetry(attempt, async () => {});
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("gives up after three attempts", async () => {
    const attempt = vi.fn().mockResolvedValue({ ok: false, code: "unavailable" });
    expect((await withRetry(attempt, async () => {})).code).toBe("unavailable");
    expect(attempt).toHaveBeenCalledTimes(3);
  });
});

describe("contracts", () => {
  it("maps database refusals to failure codes", () => {
    expect(concernFailureFromDatabase({ code: "42501", message: "forbidden" }).code).toBe("forbidden");
    expect(concernFailureFromDatabase({ code: "55000", message: "concern_settled" }).code).toBe("concern_settled");
    expect(concernFailureFromDatabase({ code: "P0001", message: "edit_expired" }).code).toBe("edit_expired");
    expect(concernFailureFromDatabase({ code: "P0001", message: "something else" }).code).toBe("unavailable");
    expect(concernFailureFromDatabase({ code: "08006" }).code).toBe("unavailable");
  });

  it("parses a deleted message placeholder", () => {
    expect(concernMessageSchema.parse(message(1, 1, { body: null, deletedAt: "2026-11-04T10:00:00Z" })).body).toBeNull();
  });

  it("accepts emoji reactions but not text", () => {
    for (const emoji of ["👍", "❤️", "🇪🇬", "1️⃣", "👩‍💻"]) expect(concernEmojiSchema.safeParse(emoji).success, emoji).toBe(true);
    for (const text of ["ok", "a b", "", "👍 "]) expect(concernEmojiSchema.safeParse(text).success, text).toBe(false);
  });
});
