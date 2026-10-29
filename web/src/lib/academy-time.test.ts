import { describe, expect, it } from "vitest";

import { academyDateTime, academyInstant, formatAcademyLong, formatAcademyRelative } from "./academy-time";

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

describe("short academy-time labels", () => {
  const at = (date: string, time: string) => academyInstant(date, time)!;
  // Thursday 29 Oct 2026, noon in Cairo.
  const now = new Date(at("2026-10-29", "12:00"));
  it.each([
    ["2026-10-29", "15:00", "Today 3pm"],
    ["2026-10-29", "09:30", "Today 9:30am"],
    ["2026-10-29", "22:00", "Tonight 10pm"],
    ["2026-10-30", "00:00", "Midnight tonight"],
    ["2026-10-30", "12:00", "Tomorrow noon"],
    ["2026-10-31", "00:00", "Tomorrow midnight"],
    ["2026-10-31", "22:00", "Saturday 10pm"],
    ["2026-11-04", "10:30", "Wednesday 10:30am"],
    ["2026-11-06", "09:00", "Next Friday 9am"],
    ["2026-10-28", "20:00", "Last night 8pm"],
    ["2026-10-29", "00:00", "Midnight last night"],
    ["2026-10-28", "08:00", "Yesterday 8am"],
    ["2026-10-23", "22:00", "Last Friday 10pm"],
    ["2026-12-25", "18:00", "25 Dec 6pm"],
    ["2025-10-30", "22:00", "30 Oct 2025 10pm"],
  ])("%s %s → %s", (date, time, label) => {
    expect(formatAcademyRelative(at(date, time), now)).toBe(label);
  });
  it("gives the full date and time for details", () => {
    expect(formatAcademyLong(at("2026-10-30", "22:00"))).toBe("Fri, 30 Oct 2026 at 10:00 pm");
  });
});
