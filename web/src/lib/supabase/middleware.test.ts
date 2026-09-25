import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getClaims = vi.hoisted(() => vi.fn());

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getClaims } }),
}));

import { updateSession } from "./middleware";

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

  it("redirects authenticated users away from login", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    const response = await updateSession(new NextRequest("https://edra.test/auth/login"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://edra.test/app");
  });

  it("keeps a recovery OTP session on the password reset route", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    const request = new NextRequest("https://edra.test/app", {
      headers: { cookie: "edra_recovery_pending=1" },
    });
    const response = await updateSession(request);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://edra.test/auth/reset-password");
  });
});
