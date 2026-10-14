import { academyDateTime } from "@/lib/academy-time";

/**
 * Advisory due dates are entered and shown in the academy time zone and stored as UTC instants. The
 * zone conversions are the shared contract in src/lib/academy-time.ts.
 */
export { ACADEMY_TIME_ZONE, academyDateTime, academyInstant, formatAcademyDateTime } from "@/lib/academy-time";

/** The academy-local date and time exactly one week after `now`: the pre-filled due date of a new assignment. */
export function weekFromNow(now: Date = new Date()): { date: string; time: string } {
  const local = academyDateTime(now.toISOString());
  const [year, month, day] = local.date.split("-").map(Number);
  return { date: new Date(Date.UTC(year, month - 1, day + 7)).toISOString().slice(0, 10), time: local.time };
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

