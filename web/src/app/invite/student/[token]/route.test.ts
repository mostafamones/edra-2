import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { GET } from "./route";

const origin = "http://learn.lvh.me:3000";
const token = "A".repeat(42) + "_";

describe("student invitation entry", () => {
  it("keeps the token in an HttpOnly cookie and opens academy onboarding", async () => {
    const response = await GET(
      new NextRequest(`${origin}/invite/student/${token}`, { headers: { host: "learn.lvh.me:3000" } }),
      { params: Promise.resolve({ token }) },
    );

    expect(response.headers.get("location")).toBe(`${origin}/onboarding/student/join`);
    expect(response.headers.get("set-cookie")).toContain(`edra_pending_student_invite=${token}`);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("canonicalizes legacy hosts before setting a host-only pending hint", async () => {
    const response = await GET(
      new NextRequest(`https://legacy.example/invite/student/${token}`, { headers: { host: "legacy.example" } }),
      { params: Promise.resolve({ token }) },
    );
    expect(response.headers.get("location")).toBe(`${origin}/invite/student/${token}`);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("rejects malformed tokens", async () => {
    for (const bad of ["bad token", "example-token", token + "A"]) {
      const response = await GET(new NextRequest("https://edra.example/invite/student/bad"), { params: Promise.resolve({ token: bad }) });
      expect(response.status).toBe(400);
    }
  });
});
