import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getClaims = vi.hoisted(() => vi.fn());

vi.mock("@supabase/ssr", async (importOriginal) => ({
  ...await importOriginal<typeof import("@supabase/ssr")>(),
  createServerClient: () => ({ auth: { getClaims } }),
}));

import { updateSession } from "./middleware";
import { describeRoute } from "../routing";
afterEach(() => vi.unstubAllEnvs());

describe("session proxy", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps marketing and authentication routes public", async () => {
    getClaims.mockResolvedValue({ data: { claims: null } });
    expect((await updateSession(new NextRequest("https://edra.test/"))).status).toBe(200);
    expect((await updateSession(new NextRequest("https://edra.test/auth/signup"))).status).toBe(200);
  });

  it("redirects anonymous app requests and preserves the destination", async () => {
    getClaims.mockResolvedValue({ data: { claims: null } });
    const response = await updateSession(new NextRequest("https://edra.test/app?tab=home"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://edra.test/auth/login?next=%2Fapp%3Ftab%3Dhome");
  });

  it("redirects anonymous requests to nested student pages", async () => {
    getClaims.mockResolvedValue({ data: { claims: null } });
    const response = await updateSession(new NextRequest("https://edra.test/learn/calendar?week=next"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://edra.test/auth/login?next=%2Flearn%2Fcalendar%3Fweek%3Dnext");
  });

  it("uses configured origins for public slug protection and preserves legacy cleanup scopes", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    getClaims.mockResolvedValue({ data: { claims: null } });
    const request = new NextRequest("https://internal.invalid/magd/students?tab=all", { headers: { cookie: "sb-project-auth-token.0=stale" } });
    const response = await updateSession(request, describeRoute("staff", "/magd/students?tab=all"));
    expect(response.headers.get("location")).toBe("http://app.lvh.me:3000/auth/login?next=%2Fmagd%2Fstudents%3Ftab%3Dall");
    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect(response.headers.getSetCookie().some(cookie => cookie.includes("Domain=lvh.me"))).toBe(true);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("does not move anonymous mutations across platform origins", async () => {
    getClaims.mockResolvedValue({ data: { claims: null } });
    const response = await updateSession(new NextRequest("http://app.lvh.me:3000/magd/students", { method: "POST" }), describeRoute("staff", "/magd/students"));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("treats a phone-code (recovery) session as signed out", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1", amr: [{ method: "otp", timestamp: 1 }] } } });
    const response = await updateSession(new NextRequest("https://edra.test/app"));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/auth/login");
    expect((await updateSession(new NextRequest("https://edra.test/auth/login"))).status).toBe(200);
  });

  it("redirects authenticated users away from login", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1", amr: [{ method: "password", timestamp: 1 }] } } });
    const response = await updateSession(new NextRequest("https://edra.test/auth/login"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://edra.test/");
  });
});
