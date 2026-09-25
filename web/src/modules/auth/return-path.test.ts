import { describe, expect, it } from "vitest";

import { safeNextPath } from "./return-path";

describe("safeNextPath", () => {
  it("keeps a student onboarding destination through signup", () => {
    expect(safeNextPath("/onboarding/student?from=invite")).toBe("/onboarding/student?from=invite");
    expect(safeNextPath("/learn")).toBe("/learn");
  });

  it("rejects external and authentication-loop destinations", () => {
    expect(safeNextPath("//evil.example/learn")).toBe("/app");
    expect(safeNextPath("/\\evil.example/learn")).toBe("/app");
    expect(safeNextPath("https://evil.example/learn")).toBe("/app");
    expect(safeNextPath("/auth/login?next=/auth/login")).toBe("/app");
  });
});
