import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("./lib/supabase/middleware", () => ({ updateSession: refresh }));
import { proxy } from "./proxy";

function request(host: string, path: string, method = "GET", headers = {}) {
  return new NextRequest(`http://${host}${path}`, { method, headers: { host, ...headers } });
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  refresh.mockReset();
  refresh.mockImplementation(() => NextResponse.next());
});

describe("platform proxy", () => {
  it("maps public staff academy deep links while preserving query and encoded IDs", async () => {
    const response = await proxy(request("app.lvh.me:3000", "/magd/schedules/a%2Fb/edit?year=2026"));
    expect(response.headers.get("x-middleware-rewrite")).toBe("http://app.lvh.me:3000/app/magd/schedules/a%2Fb/edit?year=2026");
    expect(refresh.mock.calls[0][1]).toMatchObject({ platform: "staff", scope: "academy", academySlug: "magd" });
  });
  it("keeps academy rewrites internal when Next's request origin differs from the public host", async () => {
    const incoming = new NextRequest("http://localhost:3000/magd/students?search=test", {
      headers: { host: "app.lvh.me:3000" },
    });
    const response = await proxy(incoming);
    expect(response.headers.get("x-middleware-rewrite")).toBe("http://localhost:3000/app/magd/students?search=test");
    expect(response.headers.get("location")).toBeNull();
    expect(refresh.mock.calls[0][1]).toMatchObject({ platform: "staff", academySlug: "magd" });
  });
  it("maps each platform root to its own surface", async () => {
    expect((await proxy(request("lvh.me:3000", "/"))).headers.get("x-middleware-rewrite")).toBeNull();
    expect((await proxy(request("app.lvh.me:3000", "/"))).headers.get("x-middleware-rewrite")).toContain("/app");
    expect((await proxy(request("learn.lvh.me:3000", "/"))).headers.get("x-middleware-rewrite")).toContain("/learn");
  });
  it("keeps student profile global and sends academy destinations to the inaccessible boundary", async () => {
    expect((await proxy(request("learn.lvh.me:3000", "/profile"))).headers.get("x-middleware-rewrite")).toContain("/learn/profile");
    expect((await proxy(request("learn.lvh.me:3000", "/magd/content"))).headers.get("x-middleware-rewrite")).toContain("/learn/academy/magd/content");
  });
  it("rejects unknown hosts and does not trust a forwarded host", async () => {
    const response = await proxy(request("evil.example", "/magd/students", "GET", { "x-forwarded-host": "app.lvh.me:3000" }));
    expect(response.status).toBe(421);
    expect(refresh).not.toHaveBeenCalled();
  });
  it("overwrites caller-supplied routing headers", async () => {
    await proxy(request("learn.lvh.me:3000", "/profile", "GET", { "x-edra-platform": "staff", "x-edra-public-path": "/magd/students" }));
    const forwarded = refresh.mock.calls[0][0] as NextRequest;
    expect(forwarded.headers.get("x-edra-platform")).toBe("student");
    expect(forwarded.headers.get("x-edra-public-path")).toBe("/profile");
  });
  it("retains both host-only cleanup and shared-domain cookies with refresh cache metadata", async () => {
    refresh.mockImplementation(() => {
      const response = NextResponse.next();
      response.headers.append("set-cookie", "session=; Path=/; Max-Age=0");
      response.headers.append("set-cookie", "session=fresh; Domain=lvh.me; Path=/");
      response.headers.set("cache-control", "private, no-store");
      return response;
    });
    const response = await proxy(request("app.lvh.me:3000", "/magd/students"));
    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("never interprets a legacy student path as an external authority", async () => {
    const response = await proxy(request("learn.lvh.me:3000", "/learn//evil.example"));
    expect(new URL(response.headers.get("location")!).origin).toBe("http://learn.lvh.me:3000");
  });
  it("keeps APIs on their original path and rewrites same-origin canonical action requests", async () => {
    expect((await proxy(request("app.lvh.me:3000", "/api/students", "POST"))).headers.get("x-middleware-rewrite")).toBeNull();
    expect((await proxy(request("app.lvh.me:3000", "/magd/students", "POST"))).headers.get("x-middleware-rewrite")).toContain("/app/magd/students");
  });
  it("bounds legacy GET navigation and rejects obsolete POSTs without cross-origin redirects", async () => {
    expect((await proxy(request("lvh.me:3000", "/app/students?search=test"))).headers.get("location")).toBe("http://app.lvh.me:3000/app/students?search=test");
    expect((await proxy(request("app.lvh.me:3000", "/app/students?search=test"))).headers.get("x-middleware-rewrite")).toBe("http://app.lvh.me:3000/app?search=test");
    const submitted = await proxy(request("lvh.me:3000", "/app/students", "POST"));
    expect(submitted.status).toBe(409);
    expect(submitted.headers.get("location")).toBeNull();
  });
});
