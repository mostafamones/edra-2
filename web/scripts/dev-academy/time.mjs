// Cairo calendar helpers shared by the scenario builder and its validator. Pure: no I/O, no clock.
export const TIMEZONE = "Africa/Cairo";

const DAY_MS = 86_400_000;
const MIN_MS = 60_000;

export const iso = (ms) => new Date(ms).toISOString();
export const dateMs = (date) => Date.parse(`${date}T00:00:00Z`);
export const addDays = (date, days) => new Date(dateMs(date) + days * DAY_MS).toISOString().slice(0, 10);
export const weekdayOf = (date) => new Date(dateMs(date)).getUTCDay();

export function isCalendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const t = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(t) && iso(t).startsWith(value);
}

const cairoFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TIMEZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

// Cairo wall-clock minus UTC at the given instant, read from the zone rules so DST is honoured.
function cairoOffsetMs(utcMs) {
  const parts = Object.fromEntries(cairoFormat.formatToParts(new Date(utcMs)).map(({ type, value }) => [type, Number(value)]));
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - Math.floor(utcMs / 1000) * 1000;
}

// Converts a Cairo calendar date and HH:MM to a UTC epoch ms using the offset in force on that date.
export function cairoToUtcMs(date, hhmm) {
  const [hours, minutes] = hhmm.split(":").map(Number);
  const wall = dateMs(date) + (hours * 60 + minutes) * MIN_MS;
  return wall - cairoOffsetMs(wall - cairoOffsetMs(wall));
}
