import { describe, expect, it } from "vitest";

import type { Group } from "@/modules/groups";
import { audienceLabel, buildAudienceLookup, DEFAULT_FILTERS, deriveScheduleList, type ScheduleFilters } from "./derive";
import type { Schedule, ScheduleSession, ScheduleSlot } from "./queries";

const ACADEMY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const YEAR = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const SCIENCE = "55555555-5555-4555-8555-555555555555";

const group = (id: string, name: string, levelId: string, trackId: string | null, archived = false): Group => ({
  id, academy_id: ACADEMY, academic_year_id: YEAR, level_id: levelId, track_id: trackId, name,
  capacity: null, notes: null, archived_at: archived ? "2030-09-01T00:00:00Z" : null,
});

const lookup = buildAudienceLookup({
  groups: [group("g-active", "Sunday A", "secondary-1", SCIENCE), group("g-archived", "Old Group", "secondary-2", null, true)],
  tracks: [{ id: SCIENCE, level_id: "secondary-1", name: "Science", sort_order: 1 }],
  levelNames: { "secondary-1": "First Secondary", "secondary-2": "Second Secondary" },
});

const schedule = (id: string, change: Partial<Schedule>): Schedule => ({
  id, academy_id: ACADEMY, academic_year_id: YEAR, title: id, kind: "recurring", audience: "level",
  group_id: null, level_id: "secondary-1", track_id: null, mandatory: true, location: null,
  archived_at: null, created_by: "u", ...change,
});
const slot = (id: string, scheduleId: string, weekday: number, startsAt: string, endsAt: string): ScheduleSlot => ({
  id, academy_id: ACADEMY, academic_year_id: YEAR, schedule_id: scheduleId, weekday, starts_at: `${startsAt}:00`, ends_at: `${endsAt}:00`,
});

const session = (id: string, scheduleId: string, occursOn: string, startsAt: string, endsAt: string): ScheduleSession => ({
  id, academy_id: ACADEMY, academic_year_id: YEAR, schedule_id: scheduleId, occurs_on: occursOn, starts_at: `${startsAt}:00`, ends_at: `${endsAt}:00`,
});

const schedules = [
  schedule("Math", { audience: "group", group_id: "g-active", level_id: null }),
  schedule("Physics", { audience: "program", track_id: SCIENCE, mandatory: false }),
  schedule("Algebra", { level_id: "secondary-2" }),
  schedule("Revision", { kind: "one_off", level_id: "secondary-2" }),
  schedule("Mock exam", { kind: "one_off" }),
  schedule("Early review", { kind: "one_off" }),
  schedule("Late review", { kind: "one_off" }),
];
const sessions = [
  session("o1", "Revision", "2030-10-10", "16:00", "17:00"),
  session("o2", "Mock exam", "2030-10-03", "09:00", "11:00"),
  session("o3", "Early review", "2030-09-20", "09:00", "10:00"),
  session("o4", "Late review", "2030-09-25", "09:00", "10:00"),
  session("o5", "Revision", "2030-09-10", "09:00", "10:00"),
];
const slots = [
  slot("s1", "Math", 1, "16:00", "17:00"),
  slot("s2", "Math", 6, "16:00", "17:00"),
  slot("s3", "Physics", 6, "16:00", "16:45"),
  slot("s4", "Algebra", 6, "09:00", "10:00"),
  slot("s5", "Algebra", 5, "09:00", "10:00"),
  slot("s6", "Physics", 7, "18:00", "19:00"),
];
// 2030-10-01 12:00 in Cairo.
const NOW = new Date("2030-10-01T10:00:00Z");
const derive = (filters: Partial<ScheduleFilters> = {}) =>
  deriveScheduleList(schedules, slots, sessions, lookup, { ...DEFAULT_FILTERS, ...filters }, NOW);

describe("schedule list derivation", () => {
  it("groups slots under Saturday-first weekday sections, showing only nonempty days", () => {
    const list = derive();
    expect(list.weekdays.map((section) => section.weekday)).toEqual([6, 7, 1, 5]);
    expect(list.weekdays.map((section) => section.rows.length)).toEqual([3, 1, 1, 1]);
  });

  it("gives every slot of a multi-slot schedule its own row with the schedule's slot count", () => {
    const rows = derive().weekdays.flatMap((section) => section.rows).filter((row) => row.schedule.id === "Math");
    expect(rows.map((row) => row.slot.id)).toEqual(["s2", "s1"]);
    expect(rows.every((row) => row.slotCount === 2)).toBe(true);
  });

  it("sorts rows by start, then end, then name", () => {
    const saturday = derive().weekdays[0].rows.map((row) => row.schedule.title);
    expect(saturday).toEqual(["Algebra", "Physics", "Math"]);
  });

  it("gives each one-off session its own row, upcoming by date and past newest first", () => {
    const list = derive();
    expect(list.upcoming.map((row) => row.schedule.title)).toEqual(["Mock exam", "Revision"]);
    expect(list.past.map((row) => row.session.id)).toEqual(["o4", "o3", "o5"]);
    expect(list.upcoming.find((row) => row.schedule.title === "Revision")?.sessionCount).toBe(2);
  });

  it("searches schedule, group, level, and track names", () => {
    expect(derive({ search: "sunday" }).matched).toBe(1);
    expect(derive({ search: "SCIENCE" }).matched).toBe(2); // Physics and the group in the Science track
    expect(derive({ search: "second secondary" }).matched).toBe(2);
    expect(derive({ search: "revision" }).upcoming.map((row) => row.schedule.title)).toEqual(["Revision"]);
    expect(derive({ search: "nothing" }).matched).toBe(0);
  });

  it("combines level and attendance filters, using a group's level", () => {
    expect(derive({ level: "secondary-1" }).weekdays.flatMap((section) => section.rows).map((row) => row.schedule.title).sort())
      .toEqual(["Math", "Math", "Physics", "Physics"]);
    expect(derive({ level: "secondary-1", attendance: "optional" }).matched).toBe(1);
    expect(derive({ level: "secondary-2", attendance: "optional" }).matched).toBe(0);
    expect(derive({ attendance: "mandatory", search: "review" }).past).toHaveLength(2);
  });

  it("labels each audience shape, including archived groups", () => {
    expect(audienceLabel(schedules[0], lookup)).toBe("Sunday A · First Secondary · Science");
    expect(audienceLabel(schedules[1], lookup)).toBe("First Secondary · Science");
    expect(audienceLabel(schedules[2], lookup)).toBe("Second Secondary · Whole level");
    const archivedGroup = schedule("Old", { audience: "group", group_id: "g-archived", level_id: null, archived_at: "2030-09-02T00:00:00Z" });
    expect(audienceLabel(archivedGroup, lookup)).toBe("Old Group · Second Secondary");
    expect(deriveScheduleList([archivedGroup], [slot("s9", "Old", 2, "10:00", "11:00")], [], lookup, { ...DEFAULT_FILTERS, search: "old group" }, NOW).matched).toBe(1);
  });
});
