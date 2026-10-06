import type { Schedule, ScheduleSession, ScheduleSlot } from "@/modules/schedules";

/** Today's planned classes that have not ended and have no session yet: the quick-start list. */

export const MAX_UPCOMING = 6;

export type Upcoming = {
  schedule: Schedule;
  /** "HH:mm[:ss]" planned start and end today. */
  startsAt: string;
  endsAt: string;
};

const minutesOf = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

/** ISO weekday (1 = Monday … 7 = Sunday) of a "YYYY-MM-DD" calendar date. */
export function isoWeekday(date: string) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/**
 * `wall` is the academy wall clock as "YYYY-MM-DD HH:mm:ss". `taken` holds schedule ids that already
 * have a session today (live or finished); each schedule appears once, at its earliest remaining time.
 */
export function upcomingToday(
  schedules: Schedule[], slots: ScheduleSlot[], dates: ScheduleSession[], wall: string, taken: ReadonlySet<string>,
): Upcoming[] {
  const today = wall.slice(0, 10);
  const nowMinutes = minutesOf(wall.slice(11));
  const weekday = isoWeekday(today);
  const active = new Map(schedules.filter((schedule) => !schedule.archived_at).map((schedule) => [schedule.id, schedule]));

  const earliest = new Map<string, Upcoming>();
  for (const time of [...slots.filter((slot) => slot.weekday === weekday), ...dates.filter((date) => date.occurs_on === today)]) {
    const schedule = active.get(time.schedule_id);
    if (!schedule || taken.has(schedule.id) || minutesOf(time.ends_at) <= nowMinutes) continue;
    const current = earliest.get(schedule.id);
    if (!current || minutesOf(time.starts_at) < minutesOf(current.startsAt)) {
      earliest.set(schedule.id, { schedule, startsAt: time.starts_at, endsAt: time.ends_at });
    }
  }
  return [...earliest.values()]
    .sort((a, b) => minutesOf(a.startsAt) - minutesOf(b.startsAt) || a.schedule.title.localeCompare(b.schedule.title))
    .slice(0, MAX_UPCOMING);
}
