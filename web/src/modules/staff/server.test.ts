import { beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ rpc: vi.fn(), redirect: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: api.redirect }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: api.rpc }) }));
import { isStaffAccount } from "./server";
beforeEach(() => { vi.clearAllMocks(); });
it("routes an ended session through the existing sign-out recovery instead of crashing the student layout", async () => {
  const navigation = new Error("redirect");
  api.rpc.mockResolvedValue({ data: null, error: { code: "EDRA_SESSION_INACTIVE" } });
  api.redirect.mockImplementation(() => { throw navigation; });
  await expect(isStaffAccount()).rejects.toBe(navigation);
  expect(api.redirect).toHaveBeenCalledWith("/auth/session-ended");
});
it("preserves staff detection for a valid session", async () => {
  api.rpc.mockResolvedValue({ data: true, error: null });
  expect(await isStaffAccount()).toBe(true);
  expect(api.redirect).not.toHaveBeenCalled();
});
it("does not turn an unrelated database failure into a forced sign-out", async () => {
  const error = { code: "XX000", message: "Database unavailable" };
  api.rpc.mockResolvedValue({ data: null, error });
  await expect(isStaffAccount()).rejects.toBe(error);
  expect(api.redirect).not.toHaveBeenCalled();
});
