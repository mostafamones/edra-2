/**
 * Academy dates and times are entered and shown in the academy time zone (Africa/Cairo, which observes
 * daylight saving time) and stored as UTC instants. Assignments and quizzes share these helpers.
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

const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

/**
 * The UTC instant of an academy-local date ("YYYY-MM-DD") and time ("HH:mm"), or null when the input
 * is malformed, is not a real calendar date, is outside 2000–2100, or names a wall-clock time that
 * does not exist (the hour skipped when daylight saving starts). A repeated autumn hour resolves to
 * its earlier occurrence. The result always converts back to exactly the requested local date and time.
 */
export function academyInstant(date: string, time: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const clock = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match || !clock) return null;
  const [year, month, day, hour, minute] = [match[1], match[2], match[3], clock[1], clock[2]].map(Number);
  if (year < MIN_YEAR || year > MAX_YEAR) return null;
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const calendar = new Date(wall);
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return null;

  const offsetAt = (instant: number) => {
    const local = academyDateTime(new Date(instant).toISOString());
    const [y, m, d] = local.date.split("-").map(Number);
    const [hh, mm] = local.time.split(":").map(Number);
    return Date.UTC(y, m - 1, d, hh, mm) - instant;
  };
  // Candidate instants under every offset in force within a day either side; keep those that round-trip.
  const day_ms = 86_400_000;
  const offsets = new Set([offsetAt(wall - day_ms), offsetAt(wall), offsetAt(wall + day_ms)]);
  const matches = [...offsets].map((offset) => wall - offset).filter((instant) => offsetAt(instant) === wall - instant);
  if (matches.length === 0) return null;
  return new Date(Math.min(...matches)).toISOString();
}

const display = new Intl.DateTimeFormat("en-GB", {
  timeZone: ACADEMY_TIME_ZONE, weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
});

/** "Tue, 14 Oct 2026, 23:59" in the academy time zone. */
export function formatAcademyDateTime(iso: string): string {
  return display.format(new Date(iso));
}
