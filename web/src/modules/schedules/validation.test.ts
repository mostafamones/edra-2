import { describe, expect, it } from "vitest";

import {
  scheduleFormDefaults, scheduleFormSchema, scheduleInputSchema, toScheduleInput, type ScheduleFormValues,
} from "./validation";

const ACADEMY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const GROUP = "66666666-6666-4666-8666-666666666666";
const TRACK = "55555555-5555-4555-8555-555555555555";
const YEAR = { starts_on: "2030-08-16", ends_on: "2031-08-15" };

const oneOff = {
  academyId: ACADEMY,
  title: "Revision",
  kind: "one_off" as const,
  audience: "level" as const,
  groupId: null,
  levelId: "secondary-1",
  trackId: null,
  mandatory: true,
  location: "Room 1",
  slots: [],
  sessions: [{ date: "2030-10-01", startsAt: "16:00", endsAt: "17:00" }],
};
const recurring = {
  ...oneOff,
  kind: "recurring" as const,
  slots: [{ weekday: 6, startsAt: "16:00", endsAt: "17:00" }],
  sessions: [],
};

const paths = (value: unknown, schema = scheduleInputSchema) => {
  const result = schema.safeParse(value);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
};

describe("schedule input", () => {
  it("accepts group, whole-level, and level + track audiences", () => {
    expect(paths({ ...oneOff, audience: "group", groupId: GROUP, levelId: null })).toEqual([]);
    expect(paths(oneOff)).toEqual([]);
    expect(paths({ ...oneOff, audience: "program", trackId: TRACK })).toEqual([]);
  });

  it("reports a missing audience target beside its field", () => {
    expect(paths({ ...oneOff, audience: "group", levelId: null })).toEqual(["groupId"]);
    expect(paths({ ...oneOff, levelId: null })).toEqual(["levelId"]);
    expect(paths({ ...oneOff, audience: "program" })).toEqual(["trackId"]);
    expect(paths({ ...oneOff, trackId: TRACK })).toEqual(["audience"]);
  });

  it("requires a name and stores a blank location as null", () => {
    expect(paths({ ...oneOff, title: " " })).toEqual(["title"]);
    expect(scheduleInputSchema.parse({ ...oneOff, location: "   " }).location).toBeNull();
    expect(scheduleInputSchema.parse({ ...oneOff, location: null }).location).toBeNull();
    expect(paths({ ...oneOff, location: "x".repeat(121) })).toEqual(["location"]);
  });

  it("requires 1–20 weekly slots and no one-off timing for recurring schedules", () => {
    expect(paths(recurring)).toEqual([]);
    expect(paths({ ...recurring, slots: [] })).toEqual(["slots"]);
    const slots = Array.from({ length: 21 }, (_, index) => ({ weekday: 1, startsAt: `0${index % 10}:${10 + index}`, endsAt: "23:00" }));
    expect(paths({ ...recurring, slots })).toContain("slots");
    expect(paths({ ...recurring, sessions: oneOff.sessions })).toEqual(["kind"]);
    expect(paths({ ...recurring, slots: [{ weekday: 8, startsAt: "16:00", endsAt: "17:00" }] })).toEqual(["slots.0.weekday"]);
  });

  it("reports blank and backwards slot times on the affected slot", () => {
    const slots = [
      { weekday: 6, startsAt: "16:00", endsAt: "17:00" },
      { weekday: 1, startsAt: "", endsAt: "" },
      { weekday: 2, startsAt: "18:00", endsAt: "17:00" },
    ];
    expect(paths({ ...recurring, slots })).toEqual(["slots.1.startsAt", "slots.1.endsAt", "slots.2.endsAt"]);
  });

  it("rejects duplicate weekday and start time within a schedule but allows other overlaps", () => {
    expect(paths({ ...recurring, slots: [
      { weekday: 6, startsAt: "16:00", endsAt: "17:00" },
      { weekday: 6, startsAt: "16:00", endsAt: "18:00" },
    ] })).toEqual(["slots.1.startsAt"]);
    expect(paths({ ...recurring, slots: [
      { weekday: 6, startsAt: "16:00", endsAt: "17:00" },
      { weekday: 6, startsAt: "16:30", endsAt: "17:30" },
      { weekday: 7, startsAt: "16:00", endsAt: "17:00" },
    ] })).toEqual([]);
  });

  it("requires a date and valid times for every one-off session", () => {
    const session = (change: object) => ({ ...oneOff, sessions: [{ ...oneOff.sessions[0], ...change }] });
    expect(paths({ ...oneOff, sessions: [] })).toEqual(["sessions"]);
    expect(paths(session({ date: "" }))).toEqual(["sessions.0.date"]);
    expect(paths(session({ date: "2030-02-30" }))).toEqual(["sessions.0.date"]);
    expect(paths(session({ endsAt: "15:00" }))).toEqual(["sessions.0.endsAt"]);
    expect(paths(session({ startsAt: "25:00" }))).toEqual(["sessions.0.startsAt"]);
    expect(paths(session({ startsAt: "10:61", endsAt: "11:00" }))).toEqual(["sessions.0.startsAt"]);
    expect(paths(session({ startsAt: "00:00", endsAt: "23:59" }))).toEqual([]);
    expect(paths({ ...oneOff, slots: recurring.slots })).toEqual(["kind"]);
  });

  it("accepts several one-off sessions but not a repeated date and start", () => {
    const other = { date: "2030-10-08", startsAt: "16:00", endsAt: "17:00" };
    expect(paths({ ...oneOff, sessions: [...oneOff.sessions, other] })).toEqual([]);
    expect(paths({ ...oneOff, sessions: [...oneOff.sessions, { ...oneOff.sessions[0], endsAt: "18:00" }] })).toEqual(["sessions.1.startsAt"]);
    const many = Array.from({ length: 51 }, (_, index) => ({ date: `2030-11-${String(1 + (index % 28)).padStart(2, "0")}`, startsAt: `0${index % 10}:00`, endsAt: "23:00" }));
    expect(paths({ ...oneOff, sessions: many })).toContain("sessions");
  });

  it("drops the obsolete schedule date range", () => {
    const parsed = scheduleInputSchema.parse({ ...recurring, startsOn: "2030-09-01", endsOn: "2031-05-01" });
    expect(parsed).not.toHaveProperty("startsOn");
    expect(parsed).not.toHaveProperty("endsOn");
  });
});

describe("schedule form", () => {
  const values = (change: Partial<ScheduleFormValues> = {}): ScheduleFormValues => ({
    ...scheduleFormDefaults("recurring"), title: "Weekly", levelId: "secondary-1", audience: "level", ...change,
  });
  const formPaths = (value: ScheduleFormValues) => paths(value, scheduleFormSchema(ACADEMY, YEAR) as never);

  it("starts managers on recurring with one blank Saturday slot, a group audience, and mandatory attendance", () => {
    const defaults = scheduleFormDefaults("recurring");
    expect(defaults).toMatchObject({ kind: "recurring", audience: "group", mandatory: true, location: "" });
    expect(defaults.slots).toEqual([{ weekday: 6, startsAt: "", endsAt: "" }]);
    expect(scheduleFormDefaults("one_off").kind).toBe("one_off");
  });

  it("loads an existing schedule with HH:mm times and Saturday-first slots", () => {
    const defaults = scheduleFormDefaults("recurring", {
      title: "Weekly", location: null, kind: "recurring", audience: "program", group_id: null, level_id: "secondary-1",
      track_id: TRACK, mandatory: false,
    }, [
      { weekday: 1, starts_at: "09:00:00", ends_at: "10:00:00" },
      { weekday: 6, starts_at: "16:00:00", ends_at: "17:30:00" },
    ]);
    expect(defaults.slots).toEqual([
      { weekday: 6, startsAt: "16:00", endsAt: "17:30" },
      { weekday: 1, startsAt: "09:00", endsAt: "10:00" },
    ]);
    expect(defaults).toMatchObject({ location: "", trackId: TRACK, mandatory: false });
  });

  it("loads one-off sessions in date order with HH:mm times", () => {
    const defaults = scheduleFormDefaults("one_off", {
      title: "Revision", location: null, kind: "one_off", audience: "level", group_id: null, level_id: "secondary-1",
      track_id: null, mandatory: true,
    }, [], [
      { occurs_on: "2030-10-08", starts_at: "16:00:00", ends_at: "17:00:00" },
      { occurs_on: "2030-10-01", starts_at: "09:30:00", ends_at: "10:30:00" },
    ]);
    expect(defaults.sessions).toEqual([
      { date: "2030-10-01", startsAt: "09:30", endsAt: "10:30" },
      { date: "2030-10-08", startsAt: "16:00", endsAt: "17:00" },
    ]);
  });

  it("sends only the fields that apply to the chosen type and audience", () => {
    const input = toScheduleInput(values({
      kind: "one_off", groupId: GROUP, trackId: TRACK, location: "  ",
      sessions: [{ date: "2030-10-01", startsAt: "16:00", endsAt: "17:00" }],
    }), ACADEMY);
    expect(input).toMatchObject({ groupId: null, levelId: "secondary-1", trackId: null, slots: [], location: null });
    expect(input.sessions).toHaveLength(1);
    const weekly = toScheduleInput(values({ sessions: [{ date: "2030-10-01", startsAt: "16:00", endsAt: "17:00" }] }), ACADEMY);
    expect(weekly.sessions).toEqual([]);
  });

  it("reports every invalid field at once", () => {
    expect(formPaths(values({ title: "", levelId: "" }))).toEqual(["title", "levelId", "slots.0.startsAt", "slots.0.endsAt"]);
  });

  it("keeps one-off sessions within the academic year", () => {
    const on = (date: string) => values({ kind: "one_off", sessions: [{ date, startsAt: "16:00", endsAt: "17:00" }] });
    expect(formPaths(on("2030-08-16"))).toEqual([]);
    expect(formPaths(on("2031-08-15"))).toEqual([]);
    expect(formPaths(on("2030-08-15"))).toEqual(["sessions.0.date"]);
    expect(formPaths(on("2031-08-16"))).toEqual(["sessions.0.date"]);
  });
});
