import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { GET } from "./route";

const token = "b".repeat(43);

describe("staff invitation entry", () => {
  it("stores the token in an HttpOnly cookie and moves to a URL without it", async () => {
    const response = await GET(
      new NextRequest(`http://app.lvh.me:3000/invite/staff/${token}`, { headers: { host: "app.lvh.me:3000" } }),
      { params: Promise.resolve({ token }) },
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://app.lvh.me:3000/onboarding/instructor/join");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`edra_pending_staff_invite=${token}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=lax");
    expect(cookie).toContain(`Max-Age=${60 * 60 * 24 * 7}`);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("canonicalizes old hosts before writing host-only pending state", async () => {
    const response = await GET(new NextRequest(`http://lvh.me:3000/invite/staff/${token}`), { params: Promise.resolve({ token }) });
    expect(response.headers.get("location")).toBe(`http://app.lvh.me:3000/invite/staff/${token}`);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("rejects malformed tokens without setting context", async () => {
    const response = await GET(
      new NextRequest("http://app.lvh.me:3000/invite/staff/bad"),
      { params: Promise.resolve({ token: "bad token" }) },
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
