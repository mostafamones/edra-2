import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), mux: vi.fn(), update: vi.fn(), eq: vi.fn(), is: vi.fn() }));
vi.mock("../access/data", () => ({ learningCaller: async () => ({ db: { rpc: mocks.rpc } }) }));
vi.mock("../media", () => ({ mediaAdmin: () => ({ from: () => ({ update: mocks.update }) }) }));
vi.mock("@/lib/video/mux", () => ({ muxRequest: mocks.mux }));
import { saveVideoProgress, startVideoProgress } from "./actions";
const academyId = "10000000-0000-4000-8000-000000000001", unitId = "10000000-0000-4000-8000-000000000002";
const itemId = "10000000-0000-4000-8000-000000000003", sessionId = "10000000-0000-4000-8000-000000000004";
beforeEach(() => {
  vi.clearAllMocks(); mocks.update.mockReturnValue({ eq: mocks.eq }); mocks.eq.mockReturnValue({ eq: mocks.eq, is: mocks.is }); mocks.is.mockResolvedValue({ error: null });
});
it("never contacts Mux or privileged storage when playback authority is denied", async () => {
  mocks.rpc.mockResolvedValue({ error: { message: "access_required" }, data: null });
  expect(await startVideoProgress({ academyId, unitId, itemId })).toEqual({ ok: false, message: "Active unit access is required." });
  expect(mocks.mux).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
});
it("uses the persisted trusted duration and strips provider identifiers", async () => {
  mocks.rpc.mockResolvedValue({ error: null, data: { sessionId, assetId: itemId, providerAssetId: "mux-id", durationSeconds: 100, positionSeconds: 40 } });
  expect(await startVideoProgress({ academyId, unitId, itemId })).toEqual({ ok: true, value: { sessionId, durationSeconds: 100, positionSeconds: 40 } });
  expect(mocks.mux).not.toHaveBeenCalled();
});
it("backfills an older authorized video with the provider's duration", async () => {
  mocks.rpc.mockResolvedValue({ error: null, data: { sessionId, assetId: itemId, providerAssetId: "mux-id", durationSeconds: null, positionSeconds: 0 } });
  mocks.mux.mockResolvedValue({ duration: 125.5 });
  expect(await startVideoProgress({ academyId, unitId, itemId })).toMatchObject({ ok: true, value: { durationSeconds: 125.5 } });
  expect(mocks.update).toHaveBeenCalledWith({ duration_seconds: 125.5 });
  expect(mocks.eq).toHaveBeenCalledWith("provider_asset_id", "mux-id");
});
it("rejects a forged non-finite checkpoint before contacting the database", async () => {
  expect(await saveVideoProgress({ academyId, unitId, sessionId, sequence: 1, position: Infinity, ranges: [] })).toMatchObject({ ok: false });
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("reports a lost access grant instead of claiming progress was saved", async () => {
  mocks.rpc.mockResolvedValue({ error: { message: "access_required" }, data: null });
  expect(await saveVideoProgress({ academyId, unitId, sessionId, sequence: 2, position: 20, ranges: [[10, 20]] })).toEqual({ ok: false, message: "Active unit access is required." });
});
