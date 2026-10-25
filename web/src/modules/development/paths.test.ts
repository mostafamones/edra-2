import { describe, expect, it } from "vitest";

import { exitPath, staffPreviewPath, studentsDirectoryPath } from "./paths";

const slug = "edra-dev-abc";

describe("staffPreviewPath", () => {
  it.each(["/account", "/account?tab=profile", `/${slug}`, `/${slug}/students?q=ali&page=2`])("keeps the current staff page %s", (path) => {
    expect(staffPreviewPath(slug, path)).toBe(path);
    expect(staffPreviewPath(slug, `http://app.lvh.me:3000${path}`)).toBe(path);
  });

  it.each([
    null, "/other-academy/students", `/${slug}-other/students`, "/auth/login", "/api/development/switch",
    "//evil.test/account", "https://evil.test/account", "http://learn.lvh.me:3000/profile", "/account/../other-academy",
  ])("rejects an unrelated or unsafe destination %s", (path) => {
    expect(staffPreviewPath(slug, path)).toBeNull();
  });
});

describe("studentsDirectoryPath", () => {
  it("keeps only allowlisted filters in allowlist order", () => {
    expect(studentsDirectoryPath(slug, "/edra-dev-abc/students?q=ali&page=2&evil=1&group=x")).toBe("/edra-dev-abc/students?q=ali&group=x&page=2");
  });

  it("accepts an absolute staff-origin URL", () => {
    expect(studentsDirectoryPath(slug, "http://app.lvh.me:3000/edra-dev-abc/students?status=all")).toBe("/edra-dev-abc/students?status=all");
  });

  it.each([
    ["another academy", "/other-academy/students?q=ali"],
    ["another path", "/edra-dev-abc/groups?q=ali"],
    ["a student origin URL", "http://learn.lvh.me:3000/edra-dev-abc/students"],
    ["an external URL", "https://evil.test/edra-dev-abc/students"],
    ["a protocol-relative URL", "//evil.com/edra-dev-abc/students"],
  ])("rejects %s", (_name, value) => {
    expect(studentsDirectoryPath(slug, value)).toBeNull();
  });

  it("drops values longer than 120 characters", () => {
    expect(studentsDirectoryPath(slug, `/edra-dev-abc/students?q=${"a".repeat(121)}&page=2`)).toBe("/edra-dev-abc/students?page=2");
    expect(studentsDirectoryPath(slug, `/edra-dev-abc/students?q=${"a".repeat(120)}`)).toBe(`/edra-dev-abc/students?q=${"a".repeat(120)}`);
  });

  it.each([5, null, undefined, { path: "/edra-dev-abc/students" }])("returns null for a non-string value (%j)", (value) => {
    expect(studentsDirectoryPath(slug, value)).toBeNull();
  });
});

describe("exitPath", () => {
  it("keeps a relative staff path", () => {
    expect(exitPath("/edra-dev-abc/students?q=ali")).toBe("/edra-dev-abc/students?q=ali");
  });

  it("falls back to the root for a student-origin URL", () => {
    expect(exitPath("http://learn.lvh.me:3000/profile")).toBe("/");
  });

  it("falls back to the root for an external URL", () => {
    expect(exitPath("https://evil.test/app")).toBe("/");
  });

  it("falls back to the root for null", () => {
    expect(exitPath(null)).toBe("/");
  });
});
