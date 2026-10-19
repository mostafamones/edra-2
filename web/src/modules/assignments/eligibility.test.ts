import { describe, expect, it } from "vitest";
import { isRequiredNotReceived, requirementLabel } from "./eligibility";

describe("required work compatibility and missing-work filters", () => {
  it("keeps legacy recipients required", () => {
    expect(isRequiredNotReceived({ workStatus: "expected" })).toBe(true);
    expect(requirementLabel({})).toBe("Required");
  });

  it("excludes optional non-submission, including a staff-entered missing status", () => {
    for (const workStatus of ["expected", "missing"] as const) {
      expect(isRequiredNotReceived({ required: false, workStatus })).toBe(false);
    }
    expect(requirementLabel({ required: false })).toBe("Optional");
  });

  it("keeps an ended requirement ended after the student becomes eligible again", () => {
    const row = { required: true, requirementEndedAt: "2026-10-19T10:00:00Z", workStatus: "missing" as const };
    expect(isRequiredNotReceived(row)).toBe(false);
    expect(requirementLabel(row)).toBe("Requirement ended");
    expect(isRequiredNotReceived({ required: true, workStatus: "submitted" })).toBe(false);
  });
});
