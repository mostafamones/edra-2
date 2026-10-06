import { describe, expect, it } from "vitest";

import { safeNextPath } from "./return-path";

describe("safeNextPath", () => {
  it("keeps a student onboarding destination through signup", () => {
    expect(safeNextPath("/onboarding/student?from=invite")).toBe("/onboarding/student?from=invite");
    expect(safeNextPath("/learn")).toBe("/learn");
  });

  it("preserves explicit academy URLs and rejects encoded bypasses", () => {
    expect(safeNextPath("/magd/students?student=42")).toBe("/magd/students?student=42");
    for (const path of ["/%2f%2fevil.example", "/%252f%252fevil.example", "/%61uth/login", "/bad%ZZ"]) expect(safeNextPath(path)).toBe("/");
    expect(safeNextPath("http://learn.lvh.me:3000/profile")).toBe("http://learn.lvh.me:3000/profile");
    expect(safeNextPath("http://user@learn.lvh.me:3000/profile")).toBe("/");
  });

  it("rejects external and authentication-loop destinations", () => {
    expect(safeNextPath("//evil.example/learn")).toBe("/");
    expect(safeNextPath("/\\evil.example/learn")).toBe("/");
    expect(safeNextPath("https://evil.example/learn")).toBe("/");
    expect(safeNextPath("/auth/login?next=/auth/login")).toBe("/");
  });
});
