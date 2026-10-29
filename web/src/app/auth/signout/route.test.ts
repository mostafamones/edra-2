import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ claims: null as { sub: string } | null, signOut: vi.fn(), endPreview: vi.fn(async () => true) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [{ name: "edra-auth-v1.0", value: "old" }] }),
  headers: async () => new Headers({ "x-edra-platform": "student" }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: {
  getClaims: async () => ({ data: { claims: state.claims } }), signOut: state.signOut,
} }) }));
vi.mock("@/modules/staff/server", () => ({ clearPendingStaffInvite: vi.fn() }));
vi.mock("@/modules/development/server", () => ({
  endPreviewForSignOut: state.endPreview,
  clearedControlCookie: () => ({ name: "edra-dev-control", value: "", path: "/", maxAge: 0, httpOnly: true }),
  clearedFailureCookie: () => ({ name: "edra-dev-failure", value: "", path: "/", maxAge: 0 }),
}));
import { POST } from "./route";
beforeEach(() => { state.claims = null; state.signOut.mockReset(); state.endPreview.mockClear(); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co"); });
afterEach(() => vi.unstubAllEnvs());
describe("platform sign-out", () => {
  it("expires both cookie scopes and chunks even without a valid token", async () => {
    const response = await POST(new Request("http://learn.lvh.me:3000/auth/signout"));
    expect(response.headers.get("location")).toBe("http://learn.lvh.me:3000/auth/login");
    const auth = response.headers.getSetCookie().filter(cookie => cookie.startsWith("edra-auth-v1"));
    expect(auth).toHaveLength(4);
    expect(auth.every(cookie => cookie.includes("Max-Age=0"))).toBe(true);
    expect(auth.filter(cookie => cookie.includes("Domain=lvh.me"))).toHaveLength(2);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("preserves global revocation for an authenticated sign-out", async () => {
    state.claims = { sub: "user" };
    await POST(new Request("http://learn.lvh.me:3000/auth/signout"));
    expect(state.signOut).toHaveBeenCalledWith({ scope: "global" });
  });
  it("ends a Developer mode control before revoking the session and clears its cookie", async () => {
    state.claims = { sub: "user" };
    const response = await POST(new Request("http://learn.lvh.me:3000/auth/signout"));
    expect(state.endPreview).toHaveBeenCalledOnce();
    expect(state.endPreview.mock.invocationCallOrder[0]).toBeLessThan(state.signOut.mock.invocationCallOrder[0]);
    expect(response.headers.getSetCookie().some(cookie => cookie.startsWith("edra-dev-control=;") && cookie.includes("Max-Age=0"))).toBe(true);
    expect(response.headers.getSetCookie().some(cookie => cookie.startsWith("edra-dev-failure=;") && cookie.includes("Max-Age=0"))).toBe(true);
  });
  it("preserves a safe destination for signing in again", async () => {
    const response = await POST(new Request("http://learn.lvh.me:3000/auth/signout?next=%2Facademy%2Flearning%3Funit%3D123"));
    expect(new URL(response.headers.get("location")!).searchParams.get("next")).toBe("/academy/learning?unit=123");
  });
  it("rejects external recovery destinations", async () => {
    const response = await POST(new Request("http://learn.lvh.me:3000/auth/signout?next=https%3A%2F%2Fevil.example"));
    expect(new URL(response.headers.get("location")!).searchParams.get("next")).toBe("/");
  });
});
