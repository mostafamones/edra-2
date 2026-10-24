import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authority: vi.fn(), membership: vi.fn(), list: vi.fn(), remove: vi.fn(), rpc: vi.fn(), signOut: vi.fn() }));
vi.mock("../../lib/supabase/authority", () => ({ cookieAuthority: mocks.authority }));
vi.mock("./image", () => ({ encodeAvatar: vi.fn() }));
import { deleteAccount } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  const query = { select: () => query, eq: () => query, limit: mocks.membership };
  mocks.authority.mockResolvedValue({ userId: "caller", db: {
    from: () => query, storage: { from: () => ({ list: mocks.list, remove: mocks.remove }) },
    rpc: mocks.rpc, auth: { signOut: mocks.signOut },
  } });
  mocks.membership.mockResolvedValue({ data: [], error: null });
  mocks.list.mockResolvedValue({ data: [{ name: "avatar.webp" }], error: null });
  mocks.remove.mockResolvedValue({ error: null });
  mocks.rpc.mockResolvedValue({ error: null });
  mocks.signOut.mockResolvedValue({ error: null });
});

it("requires confirmation and a live caller before any deletion", async () => {
  expect((await deleteAccount("yes")).ok).toBe(false);
  expect(mocks.authority).not.toHaveBeenCalled();
  mocks.authority.mockResolvedValue(null);
  expect((await deleteAccount("delete my account")).ok).toBe(false);
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("keeps an owner's avatar when account deletion is refused", async () => {
  mocks.membership.mockResolvedValue({ data: [{ academy_id: "owned" }], error: null });
  expect(await deleteAccount("delete my account")).toMatchObject({ ok: false, message: "Transfer or delete the academies you own first." });
  expect(mocks.list).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("keeps the account active when its pictures cannot be removed", async () => {
  mocks.remove.mockResolvedValue({ error: { message: "unavailable" } });
  expect((await deleteAccount("delete my account")).ok).toBe(false);
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.signOut).not.toHaveBeenCalled();
});

it("removes only the caller's pictures and clears cookies after anonymization", async () => {
  expect(await deleteAccount(" DELETE MY ACCOUNT ")).toEqual({ ok: true });
  expect(mocks.list).toHaveBeenCalledWith("caller", { limit: 100 });
  expect(mocks.remove).toHaveBeenCalledWith(["caller/avatar.webp"]);
  expect(mocks.rpc).toHaveBeenCalledWith("delete_my_account");
  expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
});
