import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const caller = vi.hoisted(() => ({ rpc: vi.fn(), signedIn: true }));
const admin = vi.hoisted(() => ({ rpc: vi.fn(), createSignedUploadUrl: vi.fn(), remove: vi.fn() }));
vi.mock("@tanstack/react-start/server-only", () => ({}));
vi.mock("@/lib/env/public", () => ({ publicEnv: { supabaseUrl: "https://project.supabase.test" } }));
vi.mock("@/lib/supabase/authority", () => ({ cookieAuthority: vi.fn(async () => caller.signedIn ? { userId: "u", db: { rpc: caller.rpc } } : null) }));
const measured = vi.hoisted(() => ({ seconds: undefined as number | null | undefined }));
vi.mock("./probe", async (original) => {
  const actual = await original<typeof import("./probe")>();
  return { ...actual, voiceDuration: (...args: Parameters<typeof actual.voiceDuration>) => measured.seconds === undefined ? actual.voiceDuration(...args) : measured.seconds };
});
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc: admin.rpc, storage: { from: () => ({ createSignedUploadUrl: admin.createSignedUploadUrl, remove: admin.remove }) } }) }));

const { finishConcernUpload, runConcernMediaMaintenance, serveConcernMedia, startConcernUpload } = await import("./media.server");

const academyId = "11111111-1111-4111-8111-111111111111";
const concernId = "22222222-2222-4222-8222-222222222222";
const attachmentId = "33333333-3333-4333-8333-333333333333";
const path = `${academyId}/${concernId}/${attachmentId}`;
const record = (extra: Record<string, unknown> = {}) => ({ id: attachmentId, name: "notes.html", contentType: null, bytes: 6, kind: "file",
  durationSeconds: null, state: "pending", path, ...extra });
const fetchMock = vi.fn();

beforeEach(() => {
  caller.signedIn = true; caller.rpc.mockReset(); admin.rpc.mockReset(); admin.remove.mockReset(); admin.createSignedUploadUrl.mockReset(); fetchMock.mockReset();
  measured.seconds = undefined;
  admin.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => name === "claim_concern_media_purge" ? { data: [], error: null }
    : { data: record({ state: args.p_accept ? "ready" : "removed", contentType: args.p_content_type, durationSeconds: args.p_duration_seconds ?? null }), error: null });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const request = (headers: Record<string, string> = {}, search = "") => new Request(`https://staff.test/api/concerns/${academyId}/${concernId}/${attachmentId}${search}`, { headers });

describe("concern media delivery", () => {
  it("rechecks access on every request and never reveals revoked or deleted media", async () => {
    caller.signedIn = false;
    expect((await serveConcernMedia(request(), { academyId, concernId, attachmentId })).status).toBe(401);
    caller.signedIn = true;
    caller.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "forbidden" } });
    expect((await serveConcernMedia(request(), { academyId, concernId, attachmentId })).status).toBe(404);
    caller.rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "attachment_unavailable" } });
    const deleted = await serveConcernMedia(request(), { academyId, concernId, attachmentId });
    expect(deleted.status).toBe(404);
    expect(deleted.headers.get("cache-control")).toBe("private, no-store");
    expect((await serveConcernMedia(request(), { academyId: "x", concernId, attachmentId })).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(caller.rpc).toHaveBeenCalledWith("concern_attachment_access", { p_academy_id: academyId, p_concern_id: concernId, p_attachment_id: attachmentId });
  });

  it("downloads unproven types as sandboxed octet-stream and streams ranges for proven media", async () => {
    caller.rpc.mockResolvedValue({ data: record({ state: "bound", contentType: "application/octet-stream" }), error: null });
    fetchMock.mockResolvedValue(new Response("<html>", { status: 200, headers: { "content-length": "6" } }));
    const html = await serveConcernMedia(request(), { academyId, concernId, attachmentId });
    expect(html.headers.get("content-type")).toBe("application/octet-stream");
    expect(html.headers.get("content-disposition")).toBe(`attachment; filename="notes.html"; filename*=UTF-8''notes.html`);
    expect(html.headers.get("x-content-type-options")).toBe("nosniff");
    expect(html.headers.get("content-security-policy")).toContain("sandbox");
    expect(html.headers.get("cache-control")).toBe("private, no-store");

    caller.rpc.mockResolvedValue({ data: record({ state: "bound", kind: "voice", name: "Voice note.webm", contentType: "audio/webm", durationSeconds: 12 }), error: null });
    fetchMock.mockResolvedValue(new Response("ab", { status: 206, headers: { "content-range": "bytes 0-1/900", "content-length": "2" } }));
    const voice = await serveConcernMedia(request({ range: "bytes=0-1" }), { academyId, concernId, attachmentId });
    expect(voice.status).toBe(206);
    expect(voice.headers.get("content-type")).toBe("audio/webm");
    expect(voice.headers.get("content-range")).toBe("bytes 0-1/900");
    expect(fetchMock).toHaveBeenLastCalledWith(`https://project.supabase.test/storage/v1/object/authenticated/concern-media/${path}`,
      { headers: expect.objectContaining({ Range: "bytes=0-1" }) });

    caller.rpc.mockResolvedValue({ data: record({ state: "bound", name: "plan.pdf", contentType: "application/pdf" }), error: null });
    fetchMock.mockResolvedValue(new Response("%PDF-", { status: 200 }));
    expect((await serveConcernMedia(request(), { academyId, concernId, attachmentId })).headers.get("content-disposition")).toMatch(/^inline;/);
    fetchMock.mockResolvedValue(new Response("%PDF-", { status: 200 }));
    const forced = await serveConcernMedia(request({}, "?download=1"), { academyId, concernId, attachmentId });
    expect(forced.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(forced.headers.get("content-type")).toBe("application/octet-stream");
  });
});

describe("concern upload verification", () => {
  it("reserves before signing and skips the upload once bytes were accepted", async () => {
    caller.rpc.mockResolvedValue({ data: record(), error: null });
    admin.createSignedUploadUrl.mockResolvedValue({ data: { signedUrl: "https://upload.test/once" }, error: null });
    expect(await startConcernUpload({ academyId, concernId, attachmentId, kind: "file", name: "notes.html", bytes: 6 })).toEqual({ ok: true, url: "https://upload.test/once" });
    expect(admin.createSignedUploadUrl).toHaveBeenCalledWith(path);
    caller.rpc.mockResolvedValue({ data: record({ state: "ready", contentType: "application/octet-stream" }), error: null });
    expect(await startConcernUpload({ academyId, concernId, attachmentId, kind: "file", name: "notes.html", bytes: 6 })).toEqual({ ok: true, url: null });
    expect(await startConcernUpload({ academyId, concernId, attachmentId, kind: "file", name: "big.bin", bytes: 26214401 })).toMatchObject({ code: "attachment_too_large" });
    expect(await startConcernUpload({ academyId, concernId, attachmentId, kind: "file", name: "a/b", bytes: 6 })).toMatchObject({ code: "validation" });
    expect(admin.rpc).not.toHaveBeenCalled(); // Purging is scheduled maintenance, not request work.
  });

  it("recovers a retried upload whose bytes already exist by verifying them, never overwriting", async () => {
    caller.rpc.mockResolvedValue({ data: record(), error: null });
    admin.createSignedUploadUrl.mockResolvedValue({ data: null, error: { message: "The resource already exists", statusCode: "409" } });
    fetchMock.mockResolvedValueOnce(new Response("<", { status: 206, headers: { "content-range": "bytes 0-0/6" } }));
    expect(await startConcernUpload({ academyId, concernId, attachmentId, kind: "file", name: "notes.html", bytes: 6 })).toEqual({ ok: true, url: null });
    expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining(path), { headers: expect.objectContaining({ Range: "bytes=0-0" }) });
    // Nothing stored yet: signing really failed, so the client retries later with the same id.
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect(await startConcernUpload({ academyId, concernId, attachmentId, kind: "file", name: "notes.html", bytes: 6 })).toMatchObject({ ok: false, code: "unavailable" });
  });

  it("types files from their bytes and rejects size mismatches", async () => {
    caller.rpc.mockResolvedValue({ data: record(), error: null });
    fetchMock.mockResolvedValueOnce(new Response("<html>", { status: 206, headers: { "content-range": "bytes 0-5/6" } }));
    expect(await finishConcernUpload({ academyId, concernId, attachmentId })).toMatchObject({ ok: true, attachment: { contentType: "application/octet-stream" } });
    expect(admin.rpc).toHaveBeenCalledWith("verify_concern_attachment", { p_attachment_id: attachmentId, p_accept: true, p_content_type: "application/octet-stream" });
    fetchMock.mockResolvedValueOnce(new Response("<html>", { status: 206, headers: { "content-range": "bytes 0-5/999" } }));
    expect(await finishConcernUpload({ academyId, concernId, attachmentId })).toMatchObject({ ok: false, code: "attachment_unavailable" });
    expect(admin.rpc).toHaveBeenCalledWith("verify_concern_attachment", { p_attachment_id: attachmentId, p_accept: false, p_content_type: null });
  });

  it("refuses voice notes the server cannot measure, without trusting browser duration", async () => {
    caller.rpc.mockResolvedValue({ data: record({ kind: "voice", name: "v.webm" }), error: null });
    fetchMock.mockResolvedValueOnce(new Response("<html>", { status: 200 }));
    expect(await finishConcernUpload({ academyId, concernId, attachmentId })).toMatchObject({ ok: false, code: "unsupported_media" });
    expect(fetchMock.mock.calls[0][1].headers.Range).toBeUndefined();
    caller.rpc.mockResolvedValue({ data: record({ state: "ready", kind: "voice", contentType: "audio/webm", durationSeconds: 4 }), error: null });
    expect(await finishConcernUpload({ academyId, concernId, attachmentId })).toMatchObject({ ok: true, attachment: { durationSeconds: 4 } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("enforces the exact five-minute limit and stores the measured length rounded up", async () => {
    caller.rpc.mockResolvedValue({ data: record({ kind: "voice", name: "v.webm" }), error: null });
    const webmHead = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x80]);
    measured.seconds = 300.001;
    fetchMock.mockResolvedValueOnce(new Response(webmHead, { status: 200 }));
    caller.rpc.mockResolvedValue({ data: record({ kind: "voice", name: "v.webm", bytes: 5 }), error: null });
    expect(await finishConcernUpload({ academyId, concernId, attachmentId })).toMatchObject({ ok: false, code: "voice_too_long" });
    expect(admin.rpc).toHaveBeenLastCalledWith("verify_concern_attachment", { p_attachment_id: attachmentId, p_accept: false, p_content_type: null });
    measured.seconds = 123.451;
    fetchMock.mockResolvedValueOnce(new Response(webmHead, { status: 200 }));
    expect(await finishConcernUpload({ academyId, concernId, attachmentId })).toMatchObject({ ok: true, attachment: { contentType: "audio/webm", durationSeconds: 123.46 } });
    measured.seconds = 299.996;
    fetchMock.mockResolvedValueOnce(new Response(webmHead, { status: 200 }));
    expect(await finishConcernUpload({ academyId, concernId, attachmentId })).toMatchObject({ ok: true, attachment: { durationSeconds: 300 } });
    // MP4 bytes are not a supported voice note, whatever their header claims.
    measured.seconds = undefined;
    fetchMock.mockResolvedValueOnce(new Response(new Uint8Array([0, 0, 0, 8, 0x66, 0x74, 0x79, 0x70, 0, 0]), { status: 200 }));
    caller.rpc.mockResolvedValue({ data: record({ kind: "voice", name: "v.m4a", bytes: 10 }), error: null });
    expect(await finishConcernUpload({ academyId, concernId, attachmentId })).toMatchObject({ ok: false, code: "unsupported_media" });
  });

  it("surfaces a settled or revoked concern from the server's acceptance", async () => {
    caller.rpc.mockResolvedValue({ data: record(), error: null });
    fetchMock.mockResolvedValueOnce(new Response("<html>", { status: 206, headers: { "content-range": "bytes 0-5/6" } }));
    admin.rpc.mockResolvedValueOnce({ data: null, error: { code: "55000", message: "concern_settled" } });
    expect(await finishConcernUpload({ academyId, concernId, attachmentId })).toMatchObject({ ok: false, code: "concern_settled" });
  });
});

describe("scheduled concern media maintenance", () => {
  const leased = (count: number, from = 0) => Array.from({ length: count }, (_, index) => ({ id: `00000000-0000-4000-8000-${String(from + index).padStart(12, "0")}`, path: `p/${from + index}` }));

  it("purges full batches until the backlog is drained and confirms only deleted objects", async () => {
    const batches = [leased(50), leased(3, 50)];
    admin.rpc.mockImplementation(async (name: string) => name === "claim_concern_media_purge" ? { data: batches.shift() ?? [], error: null } : { data: null, error: null });
    admin.remove.mockResolvedValue({ data: [], error: null });
    expect(await runConcernMediaMaintenance()).toBe(53);
    expect(admin.remove).toHaveBeenCalledTimes(2);
    expect(admin.rpc).toHaveBeenCalledWith("complete_concern_media_purge", { p_ids: leased(3, 50).map((entry) => entry.id) });
  });

  it("leaves the lease to expire when Storage deletion fails", async () => {
    admin.rpc.mockImplementation(async (name: string) => name === "claim_concern_media_purge" ? { data: leased(50), error: null } : { data: null, error: null });
    admin.remove.mockResolvedValue({ data: null, error: { message: "down" } });
    expect(await runConcernMediaMaintenance()).toBe(0);
    expect(admin.rpc).not.toHaveBeenCalledWith("complete_concern_media_purge", expect.anything());
  });

  it("does nothing without the service credential", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(await runConcernMediaMaintenance()).toBe(0);
    expect(admin.rpc).not.toHaveBeenCalled();
  });
});
