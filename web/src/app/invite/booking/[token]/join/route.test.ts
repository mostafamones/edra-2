import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { GET } from "./route";

const origin = "http://learn.lvh.me:3000";
const token = "B".repeat(42) + "-";

describe("booking onboarding handoff", () => {
  it("records the booking entry in the HttpOnly pending cookie and opens academy onboarding", async () => {
    const response = await GET(
      new NextRequest(`${origin}/invite/booking/${token}/join`, { headers: { host: "learn.lvh.me:3000" } }),
      { params: Promise.resolve({ token }) },
    );
    expect(response.headers.get("location")).toBe(`${origin}/onboarding/student/join`);
    expect(response.headers.get("set-cookie")).toContain(`edra_pending_student_invite=booking.${token}`);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("canonicalizes other hosts before setting the cookie", async () => {
    const response = await GET(
      new NextRequest(`https://legacy.example/invite/booking/${token}/join`, { headers: { host: "legacy.example" } }),
      { params: Promise.resolve({ token }) },
    );
    expect(response.headers.get("location")).toBe(`${origin}/invite/booking/${token}/join`);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects malformed tokens", async () => {
    const response = await GET(new NextRequest(`${origin}/invite/booking/bad/join`), { params: Promise.resolve({ token: "bad" }) });
    expect(response.status).toBe(400);
  });
});
