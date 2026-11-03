import { expect, it, vi } from "vitest";
import { throughTransport } from "@/modules/transport.test-support";
vi.mock("@tanstack/react-start/server-only", () => ({}));
const mocks = vi.hoisted(() => ({ caller: vi.fn(), rpc: vi.fn(), single: vi.fn(), signed: vi.fn(), token: vi.fn() }));
vi.mock("./data", () => ({ contentCaller: mocks.caller, contentError: (error: unknown) => { if (error) throw error; }, contentResult: async (run: () => Promise<unknown>) => ({ ok: true, value: await run() }) }));
vi.mock("./media", () => ({ mediaAdmin: vi.fn(), synchronizeVideo: vi.fn() }));
vi.mock("@/lib/video/mux", () => ({ createVideoUpload: vi.fn(), deleteVideo: vi.fn(), muxRequest: vi.fn(), playbackToken: mocks.token }));
import { finishDocument, previewAsset, refreshVideo } from "./media-actions.server";

it("preserves document completion, video status, and signed preview results", async () => {
  const id = "10000000-0000-4000-8000-000000000001";
  const chain = { select: () => chain, eq: () => chain, single: mocks.single };
  mocks.caller.mockResolvedValue({ db: { rpc: mocks.rpc, from: () => chain, storage: { from: () => ({ createSignedUrl: mocks.signed }) } } });
  mocks.rpc.mockResolvedValue({ error: null });
  const completed = await finishDocument(id, id);
  expect(await throughTransport(completed)).toEqual(completed);
  expect(completed).toEqual({ ok: true, value: undefined });
  mocks.single.mockResolvedValueOnce({ data: { status: "ready", provider_upload_id: "upload" }, error: null });
  const status = await refreshVideo(id, id);
  expect(await throughTransport(status)).toEqual(status);
  mocks.single.mockResolvedValueOnce({ data: { status: "ready", kind: "document", storage_path: "private" }, error: null });
  mocks.signed.mockResolvedValue({ data: { signedUrl: "https://example.invalid/signed" }, error: null });
  const preview = await previewAsset(id, id);
  expect(await throughTransport(preview)).toEqual(preview);
  mocks.single.mockResolvedValueOnce({ data: { status: "ready", kind: "video", playback_id: "playback" }, error: null });
  mocks.token.mockImplementation((_id, audience) => ({ token: audience ?? "video", expires: 123 }));
  const video = await previewAsset(id, id);
  expect(await throughTransport(video)).toEqual(video);
});
