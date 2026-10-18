import { describe, expect, it } from "vitest";

import { describeGroupSchedule } from "./schedule";

describe("describeGroupSchedule", () => {
  it("returns null without slots", () => expect(describeGroupSchedule([])).toBeNull());

  it("formats a single slot", () => {
    expect(describeGroupSchedule([{ weekday: 3, startsAt: "17:00", location: "Harvard 1" }])).toBe("Wednesdays — 5 PM · Harvard 1");
  });

  it("shares one time and place across days", () => {
    expect(describeGroupSchedule([
      { weekday: 1, startsAt: "16:30", location: null },
      { weekday: 4, startsAt: "16:30", location: null },
    ])).toBe("Mondays and Thursdays — 4:30 PM");
  });

  it("shows only the days when times or places differ", () => {
    expect(describeGroupSchedule([
      { weekday: 6, startsAt: "10:00", location: "Lab" },
      { weekday: 1, startsAt: "16:30", location: null },
    ])).toBe("Saturdays and Mondays");
  });
});
