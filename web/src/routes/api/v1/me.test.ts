import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co"));

const state = vi.hoisted(() => ({
  profile: null as Record<string, string | null> | null,
  sign: null as null | (() => Promise<unknown>),
  filters: [] as unknown[][],
  signed: [] as unknown[][],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/authority", () => ({
  bearerAuthority: async (token: string) => token === "aaa.bbb.ccc" ? {
    userId: "user-1",
    db: {
      rpc: async () => ({ data: { allowed: true }, error: null }),
      from: (table: string) => {
        const chain = {
          select: () => chain,
          eq: (...args: unknown[]) => { state.filters.push([table, ...args]); return chain; },
          maybeSingle: async () => ({ data: state.profile, error: null }),
        };
        return chain;
      },
      storage: {
        from: (bucket: string) => ({
          createSignedUrl: (path: string, seconds: number) => {
            state.signed.push([bucket, path, seconds]);
            return state.sign!();
          },
        }),
      },
    },
  } : null,
  cookieAuthority: async () => null,
}));

import { GET } from "@/lib/api/adapters/v1/me/handler.server";

const call = (headers: Record<string, string> = { authorization: "Bearer aaa.bbb.ccc" }) => GET(new Request("http://app.lvh.me:3000/api/v1/me", { headers }));

beforeEach(() => {
  state.profile = { full_name: "Mona Adel", display_name: " Ms. Mona ", avatar_path: "user-1/a.webp" };
  state.sign = async () => ({ data: { signedUrl: "https://project.supabase.co/storage/v1/object/sign/avatars/user-1/a.webp?token=t" }, error: null });
  state.filters = [];
  state.signed = [];
});

describe("GET /api/v1/me", () => {
  it("returns the token holder's own name and a one-hour signed picture URL", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toMatchObject({ user_id: "user-1", name: "Ms. Mona", avatar_url: expect.stringContaining("token=t") });
    expect(Date.parse(body.avatar_expires_at) - Date.now()).toBeGreaterThan(59 * 60 * 1000);
    expect(state.filters).toEqual([["profiles", "id", "user-1"]]);
    expect(state.signed).toEqual([["avatars", "user-1/a.webp", 3600]]);
    expect(JSON.stringify(body)).not.toContain("avatar_path");
  });

  it("ignores a caller-supplied user id", async () => {
    await GET(new Request("http://app.lvh.me:3000/api/v1/me?user_id=other", { headers: { authorization: "Bearer aaa.bbb.ccc" } }));
    expect(state.filters).toEqual([["profiles", "id", "user-1"]]);
  });

  it("falls back to the full name, and reports no picture without signing", async () => {
    state.profile = { full_name: "Mona Adel", display_name: null, avatar_path: null };
    const body = await (await call()).json();
    expect(body).toEqual({ user_id: "user-1", name: "Mona Adel", avatar_url: null, avatar_expires_at: null });
    expect(state.signed).toEqual([]);
  });

  it("keeps the name when signing fails or throws", async () => {
    state.sign = async () => ({ data: null, error: new Error("denied") });
    expect(await (await call()).json()).toMatchObject({ name: "Ms. Mona", avatar_url: null, avatar_expires_at: null });
    state.sign = () => Promise.reject(new Error("offline"));
    expect(await (await call()).json()).toMatchObject({ name: "Ms. Mona", avatar_url: null });
  });

  it("returns null fields when the profile has no name", async () => {
    state.profile = null;
    expect(await (await call()).json()).toEqual({ user_id: "user-1", name: null, avatar_url: null, avatar_expires_at: null });
  });

  it("requires a valid bearer token and rejects mixed cookie authentication", async () => {
    expect((await call({})).status).toBe(401);
    expect((await call({ authorization: "Bearer xxx.yyy.zzz" })).status).toBe(401);
    expect((await call({ authorization: "Bearer aaa.bbb.ccc", cookie: "edra-auth-v1=x" })).status).toBe(400);
  });
});
