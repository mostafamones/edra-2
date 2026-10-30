import { describe, expect, it, vi } from "vitest";
vi.mock("@/modules/schedules", async () => ({ ...(await import("@/modules/schedules/time")), ...(await import("@/modules/schedules/derive")) }));
import { calendarEvents, layoutEvents, weekDays, type CalendarEvent } from "./events";
import type { Schedule, ScheduleSlot } from "@/modules/schedules";
import type { AssessmentListItem } from "@/modules/assessments";
import type { PastSession } from "@/modules/sessions";

const schedule: Schedule = { id: "s", academy_id: "a", academic_year_id: "y", title: "Class", kind: "recurring", audience: "level", group_id: null, level_id: "l", track_id: null, mandatory: true, location: null, archived_at: null, created_by: "u" };
const slot: ScheduleSlot = { id: "slot", academy_id: "a", academic_year_id: "y", schedule_id: "s", weekday: 5, starts_at: "16:00:00", ends_at: "17:30:00" };
const input = { days: weekDays("2026-10-30"), today: "2026-10-30", schedules: [schedule], slots: [slot], dates: [], lookup: { groups: new Map(), tracks: new Map(), levelNames: { l: "Grade" } }, sessions: [], assessments: [] as AssessmentListItem[], year: { starts_on: "2026-09-01", ends_on: "2027-08-31" } };
describe("calendar projection", () => {
  it("crosses month boundaries without using the machine timezone", () => {
    expect(weekDays("2026-11-01")).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
  });
  it("projects recurring slots only inside the academic year and retains separate occurrences", () => {
    expect(calendarEvents(input)).toMatchObject([{ day: "2026-10-30", start: 960, end: 1050 }]);
    expect(calendarEvents({ ...input, year: { starts_on: "2026-11-01", ends_on: "2027-08-31" } })).toEqual([]);
    expect(calendarEvents({ ...input, slots: [slot, { ...slot, id: "other", starts_at: "18:00:00", ends_at: "19:00:00" }] })).toHaveLength(2);
  });
  it("puts assignment deadlines in Cairo dates, not timed lessons", () => {
    const assessment = { id: "as", title: "Homework", type: "assignment", status: "active", dueAt: "2026-10-29T22:30:00Z", groupIds: [], levelId: "l", trackId: null } as unknown as Extract<AssessmentListItem, { type: "assignment" }>;
    const [event] = calendarEvents({ ...input, schedules: [], assessments: [assessment] });
    expect(event).toMatchObject({ day: "2026-10-30", deadline: true, start: 30 });
  });
  it("splits a cross-midnight quiz and omits unpublished preparation", () => {
    const assessment = { id: "q", title: "Quiz", type: "quiz", status: "scheduled", opensAt: "2026-10-30T21:30:00Z", closesAt: "2026-10-30T23:30:00Z", groupIds: [], levelId: "l", trackId: null } as unknown as Extract<AssessmentListItem, { type: "quiz" }>;
    expect(calendarEvents({ ...input, schedules: [], assessments: [assessment] })).toMatchObject([{ day: "2026-10-30", start: 1410, end: 1440 }, { day: "2026-10-31", start: 0, end: 90 }]);
    expect(calendarEvents({ ...input, schedules: [], assessments: [{ ...assessment, status: "preparing" }] })).toEqual([]);
  });
  it("assigns lanes across an overlapping cluster and resets at touching boundaries", () => {
    const event = (id: string, start: number, end: number) => ({ id, start, end }) as CalendarEvent;
    expect(layoutEvents([event("a", 60, 180), event("b", 90, 120), event("c", 120, 200), event("d", 200, 240)]).map(({ lane, lanes }) => [lane, lanes])).toEqual([[0, 2], [1, 2], [1, 2], [0, 1]]);
  });
  it("preserves the actual session snapshot and replaces its planned class exactly once", () => {
    const actual = { id: "recorded", scheduleId: "s", scheduleTitle: "Original class title", startedAt: "2026-10-30T15:00:00Z", endedAt: "2026-10-30T16:30:00Z", levelId: "l", groupName: null, levelName: "Original grade", trackName: null, state: "ended", rosterCount: 5 } as unknown as PastSession;
    const events = calendarEvents({ ...input, sessions: [actual, actual] });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ title: "Original class title", start: 1020, end: 1110, sessionId: "recorded", recorded: true });
  });
  it("uses a compact window for assessments open across days", () => {
    const assessment = { id: "q", title: "Exam", type: "exam", status: "open", opensAt: "2026-10-26T06:00:00Z", closesAt: "2026-10-28T14:00:00Z", groupIds: [], levelId: "l", trackId: null } as unknown as Extract<AssessmentListItem, { type: "exam" }>;
    const events = calendarEvents({ ...input, schedules: [], assessments: [assessment] });
    expect(events).toHaveLength(3);
    expect(events.every(event => event.window)).toBe(true);
    expect(events[0].opensAt).toBe(assessment.opensAt);
  });
});

