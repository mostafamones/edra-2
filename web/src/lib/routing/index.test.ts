import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyHost, describeRoute, internalStaffPath, internalStudentPath, platformOrigins, publicHref, safeRelativePath, staffAcademyHref, validateReturnDestination } from "./index";

afterEach(() => vi.unstubAllEnvs());
function local() {
  vi.stubEnv("NODE_ENV", "development");
  for (const key of ["EDRA_APP_ORIGIN", "EDRA_LEARN_ORIGIN", "EDRA_MARKETING_ORIGIN", "NEXT_PUBLIC_EDRA_APP_ORIGIN", "NEXT_PUBLIC_EDRA_LEARN_ORIGIN", "NEXT_PUBLIC_EDRA_MARKETING_ORIGIN"]) vi.stubEnv(key, "");
}
describe("trusted platform routes", () => {
  it("classifies exact hosts including ports without substring or suffix trust", () => {
    local();
    expect(classifyHost("app.lvh.me:3000")).toBe("staff");
    expect(classifyHost("learn.lvh.me:3000")).toBe("student");
    expect(classifyHost("lvh.me:3000")).toBe("marketing");
    for (const host of ["app.lvh.me.attacker:3000", "app.lvh.me:4000", "evil-app.lvh.me:3000", "preview.vercel.app", "app.lvh.me:3000@evil.test"]) expect(classifyHost(host)).toBeNull();
  });
  it("routes roots, staff academy links, globals and unavailable scoped learning separately", () => {
    local();
    expect(describeRoute("staff", "/").internalPath).toBe("/app");
    expect(describeRoute("student", "/").internalPath).toBe("/learn");
    expect(describeRoute("marketing", "/").internalPath).toBe("/");
    expect(describeRoute("staff", "/magd/students?name=a%20b")).toMatchObject({ academySlug: "magd", scope: "academy", internalPath: "/app/magd/students", canonical: "http://app.lvh.me:3000/magd/students?name=a%20b" });
    expect(describeRoute("staff", "/account")).toMatchObject({ scope: "global", internalPath: "/account" });
    expect(describeRoute("student", "/profile")).toMatchObject({ scope: "global", internalPath: "/learn/profile" });
    expect(describeRoute("student", "/magd/content")).toMatchObject({ scope: "academy", internalPath: "/learn/academy/magd/content" });
    for (const platform of ["staff", "student"] as const) for (const path of ["/api/student-records", "/auth/verify", "/onboarding/student", "/invite/staff/token", "/_next/static/chunk.js"]) expect(describeRoute(platform, path).internalPath).toBe(path);
  });
  it("keeps manifest identifiers separate from hrefs and matches public or rewritten pathnames", () => {
    local();
    expect(publicHref("/app/students/new", "magd")).toBe("http://app.lvh.me:3000/magd/students/new");
    expect(publicHref("/app/manage/account", "magd")).toBe("http://app.lvh.me:3000/magd/manage/account");
    expect(publicHref("/app/manage/account")).toBe("http://app.lvh.me:3000/account");
    expect(publicHref("/learn/profile")).toBe("http://learn.lvh.me:3000/profile");
    expect(internalStaffPath("/magd/students", "magd")).toBe("/app/students");
    expect(internalStaffPath("/app/magd/students", "magd")).toBe("/app/students");
    expect(internalStudentPath("/profile")).toBe("/learn/profile");
    expect(() => staffAcademyHref("profile")).toThrow();
  });
  it("rejects conflicting browser/server configuration and duplicate platforms", () => {
    local(); vi.stubEnv("EDRA_APP_ORIGIN", "http://app.lvh.me:3000"); vi.stubEnv("NEXT_PUBLIC_EDRA_APP_ORIGIN", "http://wrong.lvh.me:3000");
    expect(() => platformOrigins()).toThrow(/must match/);
    vi.stubEnv("NEXT_PUBLIC_EDRA_APP_ORIGIN", "http://app.lvh.me:3000"); vi.stubEnv("EDRA_LEARN_ORIGIN", "http://app.lvh.me:3000");
    expect(() => platformOrigins()).toThrow(/distinct/);
  });
  it("requires explicit production origins and HTTPS", () => {
    local(); vi.stubEnv("NODE_ENV", "production");
    expect(() => platformOrigins()).toThrow();
    vi.stubEnv("EDRA_MARKETING_ORIGIN", "http://edra.test");
    expect(() => platformOrigins()).toThrow(/HTTPS/);
  });
});
describe("return destination safety", () => {
  it("allows configured platform origins and academy deep links only", () => {
    local();
    expect(validateReturnDestination("http://learn.lvh.me:3000/profile?tab=parent")).toEqual({ platform: "student", path: "/profile?tab=parent" });
    expect(validateReturnDestination("/magd/students?group=123")).toEqual({ platform: "staff", path: "/magd/students?group=123" });
  });
  it.each(["//evil.test", "/%2f%2fevil.test", "/%252f%252fevil.test", "/%5cevil.test", "/magd/%00", "/magd/%zz", "https://evil.test/profile", "http://user:pass@app.lvh.me:3000/magd", "/auth/login", "/api/students", "/_next/static/x", "/invite/staff/token", "/magd#access_token=secret"])("rejects %s", value => {
    local(); expect(validateReturnDestination(value)).toBeNull();
  });
  it("rejects decoded control characters and URL authority bypasses", () => {
    expect(safeRelativePath("/\\evil.test")).toBeNull();
    expect(safeRelativePath("/magd\n")).toBeNull();
  });
});
