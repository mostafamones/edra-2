import { describe, expect, it } from "vitest";

import { academyNow, academyToday, formatDate, formatTime, isPastOneOff, parseTimeInput, TIME_OPTIONS, WEEK_ORDER, weekdayName } from "./time";

describe("schedule time helpers", () => {
  it("orders the week Saturday to Friday", () => {
    expect(WEEK_ORDER.map(weekdayName)).toEqual(["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
  });

  it("formats 24-hour values in 12-hour time", () => {
    expect(formatTime("00:00")).toBe("12:00 AM");
    expect(formatTime("09:05:00")).toBe("9:05 AM");
    expect(formatTime("12:30")).toBe("12:30 PM");
    expect(formatTime("23:55")).toBe("11:55 PM");
  });

  it("offers five-minute options saved as HH:mm", () => {
    expect(TIME_OPTIONS).toHaveLength(288);
    expect(TIME_OPTIONS[0]).toEqual({ value: "00:00", label: "12:00 AM" });
    expect(TIME_OPTIONS.at(-1)).toEqual({ value: "23:55", label: "11:55 PM" });
  });

  it("formats a calendar date without shifting it", () => {
    expect(formatDate("2030-10-05")).toBe("Sat, Oct 5, 2030");
  });

  it("reads the Cairo wall clock, including across midnight UTC and daylight saving", () => {
    // Cairo is UTC+2 in winter and UTC+3 in summer (daylight saving resumed in 2023).
    expect(academyNow(new Date("2030-01-15T22:30:00Z"))).toBe("2030-01-16 00:30:00");
    expect(academyNow(new Date("2030-07-15T21:30:00Z"))).toBe("2030-07-16 00:30:00");
    expect(academyToday(new Date("2030-01-15T21:59:59Z"))).toBe("2030-01-15");
  });

  it("treats a one-off as past only after its Cairo end time", () => {
    // 17:00 Cairo on 2030-01-15 is 15:00 UTC.
    expect(isPastOneOff("2030-01-15", "17:00:00", new Date("2030-01-15T14:59:59Z"))).toBe(false);
    expect(isPastOneOff("2030-01-15", "17:00:00", new Date("2030-01-15T15:00:00Z"))).toBe(false);
    expect(isPastOneOff("2030-01-15", "17:00:00", new Date("2030-01-15T15:00:01Z"))).toBe(true);
    // Late evening UTC is already the next day in Cairo.
    expect(isPastOneOff("2030-01-15", "23:30", new Date("2030-01-15T21:45:00Z"))).toBe(true);
    expect(isPastOneOff("2030-01-16", "08:00", new Date("2030-01-15T22:30:00Z"))).toBe(false);
  });
});

describe("parseTimeInput", () => {
  it("parses common typed forms", () => {
    expect(parseTimeInput("4:30 pm")).toBe("16:30");
    expect(parseTimeInput("9")).toBe("09:00");
    expect(parseTimeInput("4")).toBe("16:00");
    expect(parseTimeInput("12am")).toBe("00:00");
    expect(parseTimeInput("1630")).toBe("16:30");
    expect(parseTimeInput("16:30")).toBe("16:30");
  });
  it("rejects invalid input", () => {
    expect(parseTimeInput("25:00")).toBeNull();
    expect(parseTimeInput("4:75")).toBeNull();
    expect(parseTimeInput("13pm")).toBeNull();
    expect(parseTimeInput("abc")).toBeNull();
  });
});
