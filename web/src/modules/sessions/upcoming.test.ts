import { describe, expect, it } from "vitest";

import type { Schedule, ScheduleSession, ScheduleSlot } from "@/modules/schedules";
import { upcomingToday } from "./upcoming";

const schedule = (id: string, overrides: Partial<Schedule> = {}): Schedule => ({
  id, academy_id: "a", academic_year_id: "y", title: id, kind: "recurring", audience: "level",
  group_id: null, level_id: "preparatory-3", track_id: null, mandatory: true, location: null, archived_at: null,
  created_by: "u", ...overrides,
});
const slot = (scheduleId: string, weekday: number, startsAt: string, endsAt: string): ScheduleSlot => ({
  id: `${scheduleId}-${weekday}-${startsAt}`, academy_id: "a", academic_year_id: "y", schedule_id: scheduleId,
  weekday, starts_at: startsAt, ends_at: endsAt,
});
const date = (scheduleId: string, occursOn: string, startsAt: string, endsAt: string): ScheduleSession => ({
  id: `${scheduleId}-${occursOn}`, academy_id: "a", academic_year_id: "y", schedule_id: scheduleId,
  occurs_on: occursOn, starts_at: startsAt, ends_at: endsAt,
});

// Monday 2026-10-05, 4:45 PM academy time.
const monday = "2026-10-05 16:45:00";
const none = new Set<string>();

describe("upcomingToday", () => {
  it("lists today's classes that have not ended, soonest first", () => {
    const result = upcomingToday(
      [schedule("late"), schedule("soon"), schedule("done"), schedule("tuesday")],
      [slot("late", 1, "19:00", "20:00"), slot("soon", 1, "17:00", "18:00"), slot("done", 1, "14:00", "16:00"), slot("tuesday", 2, "17:00", "18:00")],
      [], monday, none,
    );
    expect(result.map((item) => item.schedule.id)).toEqual(["soon", "late"]);
  });

  it("skips archived schedules and schedules that already have a session today", () => {
    const result = upcomingToday(
      [schedule("live"), schedule("old", { archived_at: "2026-10-01T00:00:00Z" }), schedule("free")],
      [slot("live", 1, "17:00", "18:00"), slot("old", 1, "17:00", "18:00"), slot("free", 1, "17:30", "18:30")],
      [], monday, new Set(["live"]),
    );
    expect(result.map((item) => item.schedule.id)).toEqual(["free"]);
  });

  it("includes one-off dates for today only and uses a schedule's earliest remaining time", () => {
    const result = upcomingToday(
      [schedule("revision", { kind: "one_off" }), schedule("double")],
      [slot("double", 1, "18:00", "19:00"), slot("double", 1, "17:00", "17:30")],
      [date("revision", "2026-10-05", "20:00", "21:00"), date("revision", "2026-10-06", "10:00", "11:00")],
      monday, none,
    );
    expect(result.map((item) => [item.schedule.id, item.startsAt])).toEqual([["double", "17:00"], ["revision", "20:00"]]);
  });
});
