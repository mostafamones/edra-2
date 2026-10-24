import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), caller: vi.fn() }));
vi.mock("../data", () => ({ contentCaller: mocks.caller, contentResult: async (run: () => Promise<unknown>) => {
  try { return { ok: true, value: await run() }; }
  catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Failed" }; }
} }));
import { loadCouponOptions, removeCouponType, updateCouponType } from "./actions";
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
it("updates name and prefix together without accepting audience changes", async () => {
  mocks.rpc.mockResolvedValue({ error: null, data: { id: academyId } });
  const requestId = crypto.randomUUID(), yearId = crypto.randomUUID(), typeId = crypto.randomUUID();
  expect(await updateCouponType({ academyId, requestId, yearId, levelId: "secondary-1", trackId: null, typeId, name: " Revision ", prefix: " rev " })).toMatchObject({ ok: true });
  expect(mocks.rpc).toHaveBeenCalledWith("update_scoped_coupon_type", { p_academy_id: academyId, p_request_id: requestId, p_year_id: yearId, p_level_id: "secondary-1", p_track_id: null, p_type_id: typeId, p_name: "Revision", p_prefix: "REV" });
});
it("returns the server removal mode and reports protected defaults", async () => {
  const input = { academyId, typeId: crypto.randomUUID(), requestId: crypto.randomUUID() };
  mocks.rpc.mockResolvedValueOnce({ error: null, data: { mode: "archived" } }).mockResolvedValueOnce({ error: { message: "default_coupon_type" }, data: null });
  expect(await removeCouponType(input)).toEqual({ ok: true, value: { mode: "archived" } });
  expect(await removeCouponType(input)).toEqual({ ok: false, message: "Default coupon types cannot be removed." });
});
