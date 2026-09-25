import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { GET } from "./route";

describe("student invitation entry", () => {
  it("keeps an opaque token in an HttpOnly cookie and bypasses role selection", async () => {
    const response = await GET(
      new NextRequest("https://edra.example/invite/student/example-token"),
      { params: Promise.resolve({ token: "example-token" }) },
    );

    expect(response.headers.get("location")).toBe("https://edra.example/onboarding/student");
    expect(response.headers.get("set-cookie")).toContain("edra_pending_student_invite=example-token");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects malformed tokens", async () => {
    const response = await GET(
      new NextRequest("https://edra.example/invite/student/bad"),
      { params: Promise.resolve({ token: "bad token" }) },
    );
    expect(response.status).toBe(400);
  });
});
