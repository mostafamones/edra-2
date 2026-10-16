import { describe, expect, it } from "vitest";

import { academyDateTime, academyInstant } from "./academy-time";

describe("academyInstant", () => {
  it("converts ordinary summer and winter wall times", () => {
    expect(academyInstant("2026-07-01", "12:00")).toBe("2026-07-01T09:00:00.000Z");
    expect(academyInstant("2026-01-15", "12:00")).toBe("2026-01-15T10:00:00.000Z");
  });

  it("rejects impossible calendar dates and unsupported years", () => {
    expect(academyInstant("2026-02-31", "10:00")).toBeNull();
    expect(academyInstant("2026-13-01", "10:00")).toBeNull();
    expect(academyInstant("2026-04-31", "10:00")).toBeNull();
    expect(academyInstant("2027-02-29", "10:00")).toBeNull();
    expect(academyInstant("1999-12-31", "10:00")).toBeNull();
    expect(academyInstant("2101-01-01", "10:00")).toBeNull();
    expect(academyInstant("2026-01-00", "10:00")).toBeNull();
  });

  it("accepts a leap day", () => {
    expect(academyInstant("2028-02-29", "10:00")).toBe("2028-02-29T08:00:00.000Z");
  });

  it("rejects the wall time skipped when daylight saving starts", () => {
    // Cairo moves from 00:00 to 01:00 on the last Friday of April.
    expect(academyInstant("2026-04-24", "00:30")).toBeNull();
    expect(academyInstant("2026-04-24", "23:59")).not.toBeNull();
    expect(academyInstant("2026-04-23", "23:59")).not.toBeNull();
  });

  it("resolves the repeated autumn hour to its earlier occurrence and round-trips", () => {
    // Cairo moves from 24:00 back to 23:00 on the last Thursday of October.
    const instant = academyInstant("2026-10-29", "23:30");
    expect(instant).toBe("2026-10-29T20:30:00.000Z");
    expect(academyDateTime(instant!)).toEqual({ date: "2026-10-29", time: "23:30" });
  });

  it("handles midnight and the year boundary", () => {
    expect(academyInstant("2026-01-01", "00:00")).toBe("2025-12-31T22:00:00.000Z");
    expect(academyInstant("2026-12-31", "23:59")).toBe("2026-12-31T21:59:00.000Z");
  });

  it("round-trips saved instants", () => {
    for (const iso of ["2026-07-01T09:00:00.000Z", "2026-01-15T10:00:00.000Z", "2026-10-29T21:30:00.000Z"]) {
      const { date, time } = academyDateTime(iso);
      expect(academyInstant(date, time)).not.toBeNull();
    }
  });

  it("rejects malformed input", () => {
    expect(academyInstant("2026-1-1", "10:00")).toBeNull();
    expect(academyInstant("2026-01-01", "24:00")).toBeNull();
  });
});
