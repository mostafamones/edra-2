import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTH_COOKIE_NAME, authCookieOptions, isLegacyAuthCookie } from "./cookie-policy";

afterEach(() => vi.unstubAllEnvs());
describe("shared auth cookie policy", () => {
  it("uses one namespace and parent scope for both local platform hosts", () => {
    vi.stubEnv("EDRA_APP_ORIGIN", "http://app.lvh.me:3000");
    vi.stubEnv("EDRA_LEARN_ORIGIN", "http://learn.lvh.me:3000");
    expect(authCookieOptions()).toMatchObject({ name: AUTH_COOKIE_NAME, domain: "lvh.me", path: "/", sameSite: "lax", secure: false });
  });
  it("rejects unrelated hosts and shared provider domains", () => {
    vi.stubEnv("NEXT_PUBLIC_EDRA_COOKIE_DOMAIN", "example.com");
    vi.stubEnv("EDRA_APP_ORIGIN", "https://app.example.com");
    vi.stubEnv("EDRA_LEARN_ORIGIN", "https://learn.foreign.com");
    expect(() => authCookieOptions()).toThrow(/both configured platform/);
    vi.stubEnv("NEXT_PUBLIC_EDRA_COOKIE_DOMAIN", "vercel.app");
    expect(() => authCookieOptions()).toThrow(/owned parent domain/);
  });
  it("identifies only this project's old namespace and chunks", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    expect(isLegacyAuthCookie("sb-project-auth-token.1")).toBe(true);
    expect(isLegacyAuthCookie("sb-other-auth-token.0")).toBe(false);
    expect(isLegacyAuthCookie(AUTH_COOKIE_NAME)).toBe(false);
  });
});
