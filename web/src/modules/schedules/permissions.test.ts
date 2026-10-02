import { describe, expect, it } from "vitest";

import { canArchiveSchedule, canCreateSchedule, canEditSchedule, creatableKinds } from "./permissions";

const ME = "33333333-3333-4333-8333-333333333333";
const OTHER = "11111111-1111-4111-8111-111111111111";
const oneOff = (createdBy: string, archived = false) => ({ kind: "one_off" as const, created_by: createdBy, archived_at: archived ? "2030-10-01T00:00:00Z" : null });
const recurring = { kind: "recurring" as const, created_by: OTHER, archived_at: null };

describe("schedule permissions", () => {
  it("lets owners and admins manage every active schedule", () => {
    for (const role of ["owner", "admin"] as const) {
      expect(creatableKinds(role)).toEqual(["recurring", "one_off"]);
      expect(canEditSchedule(role, recurring)).toBe(true);
      expect(canArchiveSchedule(role, recurring, ME)).toBe(true);
      expect(canArchiveSchedule(role, oneOff(OTHER), ME)).toBe(true);
    }
  });

  it("limits instructors to creating one-offs", () => {
    expect(creatableKinds("instructor")).toEqual(["one_off"]);
    expect(canCreateSchedule("instructor", "one_off")).toBe(true);
    expect(canCreateSchedule("instructor", "recurring")).toBe(false);
  });

  it("lets instructors edit any one-off but archive only their own", () => {
    expect(canEditSchedule("instructor", oneOff(OTHER))).toBe(true);
    expect(canArchiveSchedule("instructor", oneOff(OTHER), ME)).toBe(false);
    expect(canArchiveSchedule("instructor", oneOff(ME), ME)).toBe(true);
    expect(canArchiveSchedule("instructor", oneOff(ME), undefined)).toBe(false);
  });

  it("denies instructors every recurring change", () => {
    expect(canEditSchedule("instructor", recurring)).toBe(false);
    expect(canArchiveSchedule("instructor", { ...recurring, created_by: ME }, ME)).toBe(false);
  });

  it("offers no mutation on archived schedules", () => {
    for (const role of ["owner", "admin", "instructor"] as const) {
      expect(canEditSchedule(role, oneOff(ME, true))).toBe(false);
      expect(canArchiveSchedule(role, oneOff(ME, true), ME)).toBe(false);
    }
  });
});
