/**
 * Advisory due dates are entered and shown in the academy time zone (Africa/Cairo, which observes
 * daylight saving time) and stored as UTC instants.
 */

export const ACADEMY_TIME_ZONE = "Africa/Cairo";

const parts = new Intl.DateTimeFormat("en-CA", {
  timeZone: ACADEMY_TIME_ZONE, hourCycle: "h23",
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
});

/** The academy-local "YYYY-MM-DD" and "HH:mm" of an instant. */
export function academyDateTime(iso: string): { date: string; time: string } {
  const values = Object.fromEntries(parts.formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` };
}

/** The UTC instant of an academy-local date ("YYYY-MM-DD") and time ("HH:mm"), or null when malformed. */
export function academyInstant(date: string, time: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const clock = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match || !clock) return null;
  const wall = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(clock[1]), Number(clock[2]));
  // Two passes settle the zone offset, including across a daylight-saving change.
  let guess = wall;
  for (let pass = 0; pass < 2; pass += 1) {
    const local = academyDateTime(new Date(guess).toISOString());
    const [y, m, d] = local.date.split("-").map(Number);
    const [hh, mm] = local.time.split(":").map(Number);
    guess += wall - Date.UTC(y, m - 1, d, hh, mm);
  }
  const result = new Date(guess);
  return Number.isNaN(result.getTime()) ? null : result.toISOString();
}

/** The academy-local date and time exactly one week after `now`: the pre-filled due date of a new assignment. */
export function weekFromNow(now: Date = new Date()): { date: string; time: string } {
  const local = academyDateTime(now.toISOString());
  const [year, month, day] = local.date.split("-").map(Number);
  return { date: new Date(Date.UTC(year, month - 1, day + 7)).toISOString().slice(0, 10), time: local.time };
}

const display = new Intl.DateTimeFormat("en-GB", {
  timeZone: ACADEMY_TIME_ZONE, weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
});

/** "Tue, 14 Oct 2026, 23:59" in the academy time zone. */
export function formatAcademyDateTime(iso: string): string {
  return display.format(new Date(iso));
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Academy calendar days between now and the target instant (difference in midnight-to-midnight calendar dates in Cairo time). */
function calendarDaysUntil(targetIso: string, now: Date = new Date()): number {
  const targetDateStr = academyDateTime(targetIso).date;
  const nowDateStr = academyDateTime(now.toISOString()).date;

  const [tY, tM, tD] = targetDateStr.split("-").map(Number);
  const [nY, nM, nD] = nowDateStr.split("-").map(Number);

  const targetUtcMidnight = Date.UTC(tY, tM - 1, tD);
  const nowUtcMidnight = Date.UTC(nY, nM - 1, nD);

  return Math.round((targetUtcMidnight - nowUtcMidnight) / MS_PER_DAY);
}

/**
 * Expresses when an assignment is due relative to now in days:
 * - "Due in 3 days" / "Due in 1 day"
 * - "Due today"
 * - "Due yesterday"
 * - "Overdue by 3 days" / "Overdue by 1 day"
 */
export function formatDueIn(dueAt: string, now: Date = new Date()): string {
  const days = calendarDaysUntil(dueAt, now);
  if (days > 1) return `Due in ${days} days`;
  if (days === 1) return "Due in 1 day";
  if (days === 0) return "Due today";
  if (days === -1) return "Due yesterday";
  return `Overdue by ${Math.abs(days)} days`;
}

