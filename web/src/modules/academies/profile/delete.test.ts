import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  role: "owner" as string | null,
  rpc: { data: null as unknown, error: null as unknown },
  rpcCalls: [] as unknown[],
  removed: [] as [string, string[]][],
  removeError: null as unknown,
}));

vi.mock("@tanstack/react-start/server-only", () => ({}));
vi.mock("@/lib/env/public", () => ({ publicEnv: { supabaseUrl: "https://example.supabase.co" } }));
vi.mock("../server", () => ({
  resolveStaffAcademy: async (slug: string) => (state.role && slug === "magd" ? { id: "academy-a", slug, name: "Magd", icon: "school", role: state.role } : null),
}));
vi.mock("../../../lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { sub: "user" } } }) },
    rpc: async (name: string, args: unknown) => { state.rpcCalls.push([name, args]); return state.rpc; },
  }),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    storage: { from: (bucket: string) => ({ remove: async (paths: string[]) => { state.removed.push([bucket, paths]); return { error: state.removeError }; } }) },
  }),
}));

const { deleteAcademy } = await import("./actions.server");

beforeEach(() => {
  Object.assign(state, { role: "owner", rpc: { data: [], error: null }, rpcCalls: [], removed: [], removeError: null });
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
});

describe("deleteAcademy", () => {
  it("deletes as the Owner, then removes the returned uploads per bucket", async () => {
    state.rpc = { data: [
      { bucket_id: "assignment-images", name: "academy-a/one" },
      { bucket_id: "content-documents", name: "academy-a/unit/doc" },
      { bucket_id: "assignment-images", name: "academy-a/two" },
    ], error: null };
    await expect(deleteAcademy("magd", "Magd")).resolves.toEqual({ ok: true });
    expect(state.rpcCalls).toEqual([["delete_academy", { p_academy_id: "academy-a", p_confirm_name: "Magd" }]]);
    expect(state.removed).toEqual([["assignment-images", ["academy-a/one", "academy-a/two"]], ["content-documents", ["academy-a/unit/doc"]]]);
  });

  it("retries a failed removal and still reports the committed delete", async () => {
    state.rpc = { data: [{ bucket_id: "assignment-work", name: "academy-a/r/f" }], error: null };
    state.removeError = new Error("storage down");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(deleteAcademy("magd", "Magd")).resolves.toEqual({ ok: true });
    expect(state.removed).toHaveLength(3);
  });

  it("refuses non-Owners and a missing storage key before touching the database", async () => {
    state.role = "head_admin";
    await expect(deleteAcademy("magd", "Magd")).resolves.toEqual({ ok: false, code: "forbidden" });
    state.role = "owner";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(deleteAcademy("magd", "Magd")).resolves.toEqual({ ok: false, code: "deleteFailed" });
    expect(state.rpcCalls).toEqual([]);
  });

  it("maps a name mismatch", async () => {
    state.rpc = { data: null, error: { message: "academy_name_mismatch" } };
    await expect(deleteAcademy("magd", "magd")).resolves.toEqual({ ok: false, code: "nameMismatch" });
    expect(state.removed).toEqual([]);
  });
});
