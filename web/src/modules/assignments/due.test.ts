import { describe, expect, it } from "vitest";

import { academyDateTime, academyInstant, weekFromNow } from "./due";

describe("academy due dates", () => {
  it("converts Cairo wall time to UTC in winter (UTC+2)", () => {
    expect(academyInstant("2027-01-15", "23:59")).toBe("2027-01-15T21:59:00.000Z");
  });

  it("converts Cairo wall time to UTC in summer daylight time (UTC+3)", () => {
    expect(academyInstant("2027-07-15", "12:00")).toBe("2027-07-15T09:00:00.000Z");
  });

  it("round-trips through the academy date and time", () => {
    const instant = academyInstant("2026-10-14", "08:30")!;
    expect(academyDateTime(instant)).toEqual({ date: "2026-10-14", time: "08:30" });
  });

  it("rejects malformed input", () => {
    expect(academyInstant("2026-10-14", "24:00")).toBeNull();
    expect(academyInstant("14/10/2026", "08:00")).toBeNull();
  });

  it("pre-fills the same Cairo time one week later", () => {
    expect(weekFromNow(new Date("2026-10-07T10:30:00.000Z"))).toEqual({ date: "2026-10-14", time: "13:30" });
  });

  it("keeps the wall-clock time across a month and daylight-saving change", () => {
    // 2026-10-28 20:00 Cairo is still summer time (UTC+3); a week later the clocks have changed.
    expect(weekFromNow(new Date("2026-10-28T17:00:00.000Z"))).toEqual({ date: "2026-11-04", time: "20:00" });
  });
});
