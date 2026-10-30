import type { AssessmentListItem } from "@/modules/assessments";
import { academyNow, audienceLabel, type AudienceLookup, type Schedule, type ScheduleSession, type ScheduleSlot } from "@/modules/schedules";
import type { LiveSession, PastSession } from "@/modules/sessions";

export type CalendarEvent = {
  id: string; title: string; day: string; start: number; end: number; deadline: boolean;
  kind: "session" | "assignment" | "quiz" | "exam"; audience: string; levelIds: string[];
  location?: string | null; scheduleId?: string; sessionId?: string; assessmentId?: string; openOnly?: boolean;
  trackIds?: string[]; groupIds?: string[]; window?: boolean; opensAt?: string; closesAt?: string | null;
  live?: boolean; recorded?: boolean; status?: string; expected?: number;
};
export const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
export const clock = (value: number) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
export function shiftDay(day: string, amount: number) {
  const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10);
}
export function weekDays(day: string) {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  const first = shiftDay(day, -((weekday + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => shiftDay(first, index));
}
export function dateLabel(day: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
}

/** Splits actual timestamps on Cairo midnight, including DST transitions. */
function interval(start: string, end: string | null, days: string[], base: Omit<CalendarEvent, "day" | "start" | "end">): CalendarEvent[] {
  const first = academyNow(new Date(start));
  const last = end ? academyNow(new Date(end)) : first;
  return days.filter(day => day >= first.slice(0, 10) && day <= last.slice(0, 10)).flatMap(day => {
    const from = day === first.slice(0, 10) ? minutes(first.slice(11)) : 0;
    const to = end ? day === last.slice(0, 10) ? minutes(last.slice(11)) : 1440 : Math.min(1440, from + 30);
    return to > from ? [{ ...base, id: `${base.id}:${day}`, day, start: from, end: to }] : [];
  });
}

export function calendarEvents(input: {
  days: string[]; today: string; schedules: Schedule[]; slots: ScheduleSlot[]; dates: ScheduleSession[];
  lookup: AudienceLookup; sessions: (LiveSession | PastSession)[]; assessments: AssessmentListItem[];
  year: { starts_on: string; ends_on: string } | null;
}): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const recorded = new Set<string>();
  for (const session of new Map(input.sessions.map(session => [session.id, session])).values()) {
    const day = academyNow(new Date(session.startedAt)).slice(0, 10);
    recorded.add(`${session.scheduleId}:${day}`);
    events.push(...interval(session.startedAt, "endedAt" in session ? session.endedAt : session.autoEndAt, input.days, {
      id: `session:${session.id}`, title: session.scheduleTitle, kind: "session", deadline: false,
      audience: [session.groupName, session.levelName, session.trackName].filter(Boolean).join(" · "),
      levelIds: [session.levelId], trackIds: session.trackId ? [session.trackId] : [], groupIds: session.groupId ? [session.groupId] : [], location: session.location, scheduleId: session.scheduleId,
      sessionId: session.id, recorded: true, live: session.state === "live", expected: session.rosterCount,
    }));
  }
  for (const schedule of input.schedules) {
    if (schedule.archived_at) continue;
    for (const day of input.days) {
      if (!input.year || day < input.year.starts_on || day > input.year.ends_on || recorded.has(`${schedule.id}:${day}`)) continue;
      const weekday = new Date(`${day}T12:00:00Z`).getUTCDay() || 7;
      const occurrences = schedule.kind === "recurring"
        ? input.slots.filter(slot => slot.schedule_id === schedule.id && slot.weekday === weekday)
        : input.dates.filter(date => date.schedule_id === schedule.id && date.occurs_on === day);
      for (const occurrence of occurrences) {
        const level = schedule.level_id ?? (schedule.group_id ? input.lookup.groups.get(schedule.group_id)?.level_id : null);
        events.push({ id: `planned:${occurrence.id}:${day}`, title: schedule.title, day,
          start: minutes(occurrence.starts_at), end: minutes(occurrence.ends_at), deadline: false, kind: "session",
          audience: audienceLabel(schedule, input.lookup), levelIds: level ? [level] : [],
          trackIds: (schedule.track_id ?? (schedule.group_id ? input.lookup.groups.get(schedule.group_id)?.track_id : null)) ? [schedule.track_id ?? input.lookup.groups.get(schedule.group_id!)!.track_id!] : [],
          groupIds: schedule.group_id ? [schedule.group_id] : [], location: schedule.location,
          scheduleId: schedule.id, status: day < input.today ? "Planned" : undefined });
      }
    }
  }
  for (const item of input.assessments) {
    if (item.status === "archived" || item.status === "preparing" || item.status === "ready") continue;
    const groupLevels = item.groupIds.flatMap(id => input.lookup.groups.get(id)?.level_id ?? []);
    const levelIds = item.levelId ? [item.levelId] : [...new Set(groupLevels)];
    const audience = item.groupIds.length ? item.groupIds.map(id => input.lookup.groups.get(id)?.name ?? "Group").join(" · ")
      : [item.levelId && input.lookup.levelNames[item.levelId], item.trackId && input.lookup.tracks.get(item.trackId)?.name].filter(Boolean).join(" · ");
    const trackIds = item.trackId ? [item.trackId] : [...new Set(item.groupIds.flatMap(id => input.lookup.groups.get(id)?.track_id ?? []))];
    const base = { id: `${item.type}:${item.id}`, title: item.title, kind: item.type, audience, levelIds, trackIds, groupIds: item.groupIds, assessmentId: item.id, status: item.status };
    if (item.type === "assignment") {
      if (!item.dueAt) continue;
      const wall = academyNow(new Date(item.dueAt)), day = wall.slice(0, 10);
      if (input.days.includes(day)) events.push({ ...base, deadline: true, day, start: minutes(wall.slice(11)), end: minutes(wall.slice(11)) });
    } else if (item.opensAt) events.push(...interval(item.opensAt, item.closesAt, input.days, { ...base, deadline: false, openOnly: !item.closesAt,
      opensAt: item.opensAt, closesAt: item.closesAt,
      window: !!item.closesAt && (new Date(item.closesAt).getTime() - new Date(item.opensAt).getTime()) > 6 * 60 * 60 * 1000 }));
  }
  return events.sort((a, b) => a.day.localeCompare(b.day) || a.start - b.start || a.id.localeCompare(b.id));
}

/** Interval partitioning keeps concurrent events side-by-side, never hidden behind one another. */
export function layoutEvents(events: CalendarEvent[]) {
  const result: { event: CalendarEvent; lane: number; lanes: number }[] = [];
  let cluster: typeof result = [], ends: number[] = [], boundary = -1;
  const finish = () => { cluster.forEach(item => { item.lanes = ends.length; result.push(item); }); cluster = []; ends = []; };
  for (const event of [...events].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id))) {
    if (event.start >= boundary) finish();
    let lane = ends.findIndex(end => end <= event.start);
    if (lane < 0) lane = ends.length;
    // Short events still need a readable/tappable footprint in the time grid.
    const visualEnd = Math.max(event.end, event.start + 30);
    ends[lane] = visualEnd; boundary = Math.max(boundary, visualEnd);
    cluster.push({ event, lane, lanes: 1 });
  }
  finish(); return result;
}
