import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ authority: vi.fn(), update: vi.fn(), eq: vi.fn(), single: vi.fn() }));
vi.mock("@/lib/supabase/authority", () => ({ cookieAuthority: mocks.authority }));
import { saveTimeFormat } from "./preference-actions";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.single.mockResolvedValue({ data: { time_format: "12h" }, error: null });
  mocks.eq.mockReturnValue({ select: () => ({ maybeSingle: mocks.single }) });
  mocks.update.mockReturnValue({ eq: mocks.eq });
  mocks.authority.mockResolvedValue({ userId: "actual-account", db: { from: () => ({ update: mocks.update }) } });
});
describe("time format writes", () => {
  it("writes only the verified account and returns that account for cache updates", async () => {
    expect(await saveTimeFormat("12h")).toEqual({ ok: true, userId: "actual-account", format: "12h" });
    expect(mocks.eq).toHaveBeenCalledWith("id", "actual-account");
    expect(mocks.update).toHaveBeenCalledWith({ time_format: "12h" });
  });
  it("rejects invalid values and expired sessions", async () => {
    expect((await saveTimeFormat({ userId: "other", format: "12h" })).ok).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
    mocks.authority.mockResolvedValue(null);
    expect((await saveTimeFormat("12h")).ok).toBe(false);
  });
  it("does not acknowledge failed persistence", async () => {
    mocks.single.mockResolvedValue({ data: null, error: { message: "offline" } });
    expect((await saveTimeFormat("12h")).ok).toBe(false);
  });
});
