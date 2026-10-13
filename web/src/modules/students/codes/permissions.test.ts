import { describe, expect, it } from "vitest";

import { canConfigureStudentCodes, canViewStudentCodeSettings } from "./permissions";

describe("student code permissions", () => {
  it("lets owners and admins configure", () => {
    expect(canConfigureStudentCodes("owner")).toBe(true);
    expect(canConfigureStudentCodes("admin")).toBe(true);
    expect(canConfigureStudentCodes("head_admin")).toBe(true);
    expect(canConfigureStudentCodes("instructor")).toBe(false);
  });

  it("lets every staff role read", () => {
    expect(canViewStudentCodeSettings("owner")).toBe(true);
    expect(canViewStudentCodeSettings("admin")).toBe(true);
    expect(canViewStudentCodeSettings("head_admin")).toBe(true);
    expect(canViewStudentCodeSettings("instructor")).toBe(true);
  });
});
