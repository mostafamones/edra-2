import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), caller: vi.fn() }));
vi.mock("../data", () => ({ contentCaller: mocks.caller, contentResult: async (run: () => Promise<unknown>) => {
  try { return { ok: true, value: await run() }; }
  catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Failed" }; }
} }));
import { loadCouponOptions } from "./actions";
const academyId = "10000000-0000-4000-8000-000000000001";
beforeEach(() => { vi.clearAllMocks(); mocks.caller.mockResolvedValue({ userId: "staff", db: { rpc: mocks.rpc } }); });
it("loads an academy-wide coupon type returned by the database", async () => {
  mocks.rpc.mockResolvedValue({ error: null, data: { programs: [], types: [{ id: crypto.randomUUID(), yearId: crypto.randomUUID(), programId: null, levelId: null, trackId: null, name: "Regular", prefix: "REG", isDefault: true, allTracks: true }] } });
  expect(await loadCouponOptions({ academyId })).toMatchObject({ ok: true, value: { userId: "staff", types: [expect.objectContaining({ levelId: null, programId: null })] } });
});
it("reports malformed read responses as a loading problem instead of a form error", async () => {
  mocks.rpc.mockResolvedValue({ error: null, data: { programs: null, types: null } });
  expect(await loadCouponOptions({ academyId })).toEqual({ ok: false, message: "Could not load coupon settings. Refresh and try again." });
});
