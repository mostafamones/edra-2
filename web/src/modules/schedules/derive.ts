import type { Group, Track } from "@/modules/groups";

import type { Schedule, ScheduleSession, ScheduleSlot } from "./queries";
import { isPastOneOff, WEEK_ORDER } from "./time";

export const ALL = "all";

export type ScheduleFilters = {
  search: string;
  /** A level id, or ALL. */
  level: string;
  attendance: typeof ALL | "mandatory" | "optional";
};

export const DEFAULT_FILTERS: ScheduleFilters = { search: "", level: ALL, attendance: ALL };

/** Group, level, and track metadata used to describe audiences, including archived groups. */
export type AudienceLookup = {
  groups: Map<string, Group>;
  tracks: Map<string, Track>;
  levelNames: Record<string, string>;
};

export function buildAudienceLookup(data: { groups: Group[]; tracks: Track[]; levelNames: Record<string, string> }): AudienceLookup {
  return {
    groups: new Map(data.groups.map((group) => [group.id, group])),
    tracks: new Map(data.tracks.map((track) => [track.id, track])),
    levelNames: data.levelNames,
  };
}

type AudienceParts = { group?: string; level?: string; levelId: string | null; track?: string; wholeLevel: boolean };

function audienceParts(schedule: Schedule, lookup: AudienceLookup): AudienceParts {
  const group = schedule.group_id ? lookup.groups.get(schedule.group_id) : undefined;
  const levelId = schedule.audience === "group" ? group?.level_id ?? null : schedule.level_id;
  const trackId = schedule.audience === "group" ? group?.track_id : schedule.track_id;
  return {
    group: schedule.audience === "group" ? group?.name ?? "Unknown group" : undefined,
    level: levelId ? lookup.levelNames[levelId] ?? levelId : undefined,
    levelId,
    track: trackId ? lookup.tracks.get(trackId)?.name : undefined,
    wholeLevel: schedule.audience === "level",
  };
}

/** The level, group, and track names a schedule row shows separately. */
export function audienceDetails(schedule: Schedule, lookup: AudienceLookup) {
  const parts = audienceParts(schedule, lookup);
  return { level: parts.level, group: parts.group, track: parts.track };
}

/** "Sunday A · Grade 10 · Science", "Grade 10 · Whole level", or "Grade 10 · Science". */
export function audienceLabel(schedule: Schedule, lookup: AudienceLookup) {
  const parts = audienceParts(schedule, lookup);
  return [parts.group, parts.level, parts.wholeLevel ? "Whole level" : parts.track].filter(Boolean).join(" · ");
}

export function matchesFilters(schedule: Schedule, lookup: AudienceLookup, filters: ScheduleFilters) {
  const parts = audienceParts(schedule, lookup);
  if (filters.level !== ALL && parts.levelId !== filters.level) return false;
  if (filters.attendance !== ALL && schedule.mandatory !== (filters.attendance === "mandatory")) return false;
  const term = filters.search.trim().toLocaleLowerCase();
  if (!term) return true;
  return [schedule.title, parts.group, parts.level, parts.track]
    .some((text) => text?.toLocaleLowerCase().includes(term));
}

export function isFiltering(filters: ScheduleFilters) {
  return filters.search.trim() !== "" || filters.level !== ALL || filters.attendance !== ALL;
}

export type SlotRow = { schedule: Schedule; slot: ScheduleSlot; slotCount: number };
export type SessionRow = { schedule: Schedule; session: ScheduleSession; sessionCount: number };
export type WeekdaySection = { weekday: number; rows: SlotRow[] };
export type ScheduleList = {
  weekdays: WeekdaySection[];
  upcoming: SessionRow[];
  past: SessionRow[];
  /** Schedules that passed the filters, counted once each. */
  matched: number;
};

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Splits schedules into Saturday-first weekday sections (one row per weekly slot) and one row
 * per one-off session, upcoming or past. `now` decides which sessions have ended on the Cairo clock.
 */
export function deriveScheduleList(
  schedules: Schedule[],
  slots: ScheduleSlot[],
  sessions: ScheduleSession[],
  lookup: AudienceLookup,
  filters: ScheduleFilters,
  now: Date,
): ScheduleList {
  const visible = schedules.filter((schedule) => matchesFilters(schedule, lookup, filters));
  const slotsBySchedule = new Map<string, ScheduleSlot[]>();
  for (const slot of slots) slotsBySchedule.set(slot.schedule_id, [...(slotsBySchedule.get(slot.schedule_id) ?? []), slot]);

  const sessionsBySchedule = new Map<string, ScheduleSession[]>();
  for (const session of sessions) sessionsBySchedule.set(session.schedule_id, [...(sessionsBySchedule.get(session.schedule_id) ?? []), session]);

  const rowsByDay = new Map<number, SlotRow[]>();
  const upcoming: SessionRow[] = [];
  const past: SessionRow[] = [];
  for (const schedule of visible) {
    if (schedule.kind === "recurring") {
      const own = slotsBySchedule.get(schedule.id) ?? [];
      for (const slot of own) rowsByDay.set(slot.weekday, [...(rowsByDay.get(slot.weekday) ?? []), { schedule, slot, slotCount: own.length }]);
    } else {
      const own = sessionsBySchedule.get(schedule.id) ?? [];
      for (const session of own) {
        (isPastOneOff(session.occurs_on, session.ends_at, now) ? past : upcoming).push({ schedule, session, sessionCount: own.length });
      }
    }
  }

  const compareRows = (a: SlotRow, b: SlotRow) =>
    byText(a.slot.starts_at, b.slot.starts_at) || byText(a.slot.ends_at, b.slot.ends_at)
    || a.schedule.title.localeCompare(b.schedule.title) || byText(a.schedule.id, b.schedule.id)
    || byText(a.slot.id, b.slot.id);
  const oneOffKey = (row: SessionRow) => `${row.session.occurs_on} ${row.session.starts_at} ${row.session.ends_at}`;
  const compareOneOffs = (a: SessionRow, b: SessionRow) =>
    byText(oneOffKey(a), oneOffKey(b)) || a.schedule.title.localeCompare(b.schedule.title)
    || byText(a.schedule.id, b.schedule.id) || byText(a.session.id, b.session.id);

  return {
    weekdays: WEEK_ORDER.filter((day) => rowsByDay.has(day))
      .map((weekday) => ({ weekday, rows: rowsByDay.get(weekday)!.sort(compareRows) })),
    upcoming: upcoming.sort(compareOneOffs),
    past: past.sort((a, b) => compareOneOffs(b, a)),
    matched: visible.length,
  };
}
