import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createVideoUpload, deleteVideo, muxRequest, MuxRequestError, type MuxUpload } from "./mux";

// Opt in explicitly with server-side development credentials. Creates only its
// own disposable test resources, then cancels/deletes them; never lists user media.
it.skipIf(process.env.EDRA_MUX_DELETE_SMOKE !== "1")("deletes a real disposable Mux asset and cancels an unused upload", async () => {
  const upload = await createVideoUpload("edra-deletion-smoke", "http://app.lvh.me:3000");
  await deleteVideo(null, upload.id);
  expect((await muxRequest<MuxUpload>(`video/v1/uploads/${upload.id}`)).status).toBe("cancelled");
  const asset = await muxRequest<{ id: string }>("video/v1/assets", {
    inputs: [{ url: "https://storage.googleapis.com/muxdemofiles/mux.mp4" }],
    playback_policies: ["signed"], video_quality: "basic", test: true,
    passthrough: "edra-disposable-deletion-smoke",
  });
  try {
    await vi.waitFor(async () => {
      const state = await muxRequest<{ status: string }>(`video/v1/assets/${asset.id}`);
      expect(state.status).not.toBe("preparing");
    }, { timeout: 30000, interval: 2000 });
    await deleteVideo(asset.id, null);
    await expect(muxRequest(`video/v1/assets/${asset.id}`)).rejects.toMatchObject({ status: 404 } satisfies Partial<MuxRequestError>);
    await deleteVideo(asset.id, null);
  } finally { await deleteVideo(asset.id, null); }
}, 60000);
