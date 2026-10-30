import { describe, expect, it } from "vitest";
import { formatClock, parseTimeFormat } from "./time-format";

describe("account time format", () => {
  it("formats noon, midnight and ordinary times without changing the clock", () => {
    expect([0, 60, 720, 840, 1439, 1440].map(value => formatClock(value, "12h"))).toEqual(["12:00 AM", "1:00 AM", "12:00 PM", "2:00 PM", "11:59 PM", "12:00 AM"]);
    expect(formatClock(840, "24h")).toBe("14:00");
  });
  it("defaults missing or unsupported values to 24-hour format", () => {
    expect(parseTimeFormat(null)).toBe("24h");
    expect(parseTimeFormat("other")).toBe("24h");
    expect(parseTimeFormat("12h")).toBe("12h");
  });
});
