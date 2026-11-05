import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@tanstack/react-start/server-only", () => ({}));
vi.mock("@/lib/supabase/authority", () => ({ cookieAuthority: vi.fn(async () => ({ userId: "u", db: { rpc } })) }));

const { sendConcernMessage, editConcernMessage, markConcernRead, createConcern, settleConcern, reopenConcern, recoverConcern, addConcernParticipants } = await import("./actions.server");

const academyId = "11111111-1111-4111-8111-111111111111";
const concernId = "22222222-2222-4222-8222-222222222222";
const messageId = "33333333-3333-4333-8333-333333333333";
const stored = {
  id: messageId, concernId, seq: 1, revision: 1, authorId: "u", authorName: null, body: "Hi", mentions: [],
  createdAt: "t", editedAt: null, deletedAt: null, replyTo: null, reactions: [], attachments: [],
};

describe("concern commands", () => {
  beforeEach(() => rpc.mockReset());

  it("validates at the trust boundary before calling the database", async () => {
    expect(await sendConcernMessage({ academyId, concernId, messageId, body: "   ", replyToId: null, mentions: [] }))
      .toMatchObject({ ok: false, code: "validation" });
    expect(await sendConcernMessage({ academyId: "nope", concernId, messageId, body: "x", replyToId: null, mentions: [] }))
      .toMatchObject({ ok: false, code: "validation" });
    expect(await markConcernRead({ academyId, concernId, seq: -1 })).toMatchObject({ ok: false, code: "validation" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("accepts media-only sends and refuses empty or duplicated media before the database", async () => {
    const attachmentId = "44444444-4444-4444-8444-444444444444";
    expect(await sendConcernMessage({ academyId, concernId, messageId, body: null, replyToId: null, mentions: [] })).toMatchObject({ code: "validation" });
    expect(await sendConcernMessage({ academyId, concernId, messageId, body: null, replyToId: null, mentions: [], attachmentIds: [attachmentId, attachmentId] }))
      .toMatchObject({ code: "validation" });
    expect(await sendConcernMessage({ academyId, concernId, messageId, body: null, replyToId: null, mentions: [], attachmentIds: Array.from({ length: 11 }, () => attachmentId) }))
      .toMatchObject({ code: "validation" });
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ data: { ...stored, body: null, attachments: [{ id: attachmentId, name: "a.pdf", contentType: "application/pdf", bytes: 4, kind: "file", durationSeconds: null }] }, error: null });
    expect(await sendConcernMessage({ academyId, concernId, messageId, body: null, replyToId: null, mentions: [], attachmentIds: [attachmentId] })).toMatchObject({ ok: true, message: { body: null, deletedAt: null } });
    expect(rpc).toHaveBeenCalledWith("send_concern_message", expect.objectContaining({ p_body: null, p_attachment_ids: [attachmentId] }));
  });

  it("passes the caller-chosen id so retries are idempotent", async () => {
    rpc.mockResolvedValue({ data: stored, error: null });
    const result = await sendConcernMessage({ academyId, concernId, messageId, body: "Hi", replyToId: null, mentions: [] });
    expect(result).toEqual({ ok: true, message: stored });
    expect(rpc).toHaveBeenCalledWith("send_concern_message", expect.objectContaining({ p_message_id: messageId, p_reply_to_id: undefined }));
  });

  it("reports server refusals", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "edit_expired" } });
    expect(await editConcernMessage({ academyId, concernId, messageId, body: "x", mentions: [] })).toMatchObject({ code: "edit_expired" });
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "forbidden" } });
    expect(await createConcern({ academyId, concernId, messageId, title: "T", body: "B", participantIds: [], wholeTeam: false, mentions: [] }))
      .toMatchObject({ code: "forbidden" });
  });

  it("sends lifecycle commands with their request id and expected version", async () => {
    const requestId = "44444444-4444-4444-8444-444444444444";
    rpc.mockResolvedValue({ data: { concernId, status: "settled", version: 2 }, error: null });
    expect(await settleConcern({ academyId, concernId, requestId, outcome: "Resolved", expectedVersion: 1 }))
      .toEqual({ ok: true, state: { concernId, status: "settled", version: 2 } });
    expect(rpc).toHaveBeenCalledWith("settle_concern", { p_academy_id: academyId, p_concern_id: concernId, p_outcome: "Resolved", p_expected_version: 1, p_request_id: requestId });
    rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "stale" } });
    expect(await reopenConcern({ academyId, concernId, requestId, reason: "Why", expectedVersion: 1 })).toMatchObject({ code: "stale" });
    rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "not_permitted" } });
    expect(await addConcernParticipants({ academyId, concernId, requestId, userIds: [messageId] })).toMatchObject({ code: "not_permitted" });
    rpc.mockReset();
    expect(await settleConcern({ academyId, concernId, requestId, outcome: "  ", expectedVersion: 1 })).toMatchObject({ code: "validation" });
    expect(await recoverConcern({ academyId, concernId: "not-an-id", requestId })).toMatchObject({ code: "validation" });
    expect(await addConcernParticipants({ academyId, concernId, requestId, userIds: [] })).toMatchObject({ code: "validation" });
    expect(rpc).not.toHaveBeenCalled();
  });
});
