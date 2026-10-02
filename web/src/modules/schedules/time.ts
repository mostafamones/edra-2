import { format, parseISO } from "date-fns";

/** Edra academies operate on Cairo time; one-off end times are judged against it. */
export const ACADEMY_TIME_ZONE = "Africa/Cairo";

/** ISO weekdays (1 = Monday … 7 = Sunday), listed in the academy week order Saturday–Friday. */
export const WEEK_ORDER = [6, 7, 1, 2, 3, 4, 5] as const;
const WEEKDAY_NAMES: Record<number, string> = {
  1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday", 5: "Friday", 6: "Saturday", 7: "Sunday",
};

export function weekdayName(weekday: number) {
  return WEEKDAY_NAMES[weekday] ?? "Unknown day";
}

/** "16:05" or "16:05:00" → "4:05 PM". */
export function formatTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  const suffix = hours < 12 ? "AM" : "PM";
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

/** "2026-10-03" → "Sat, Oct 3, 2026", without shifting the calendar date across time zones. */
export function formatDate(value: string) {
  return format(parseISO(value), "EEE, MMM d, yyyy");
}

/** Selectable times every five minutes, saved as HH:mm and labelled in 12-hour format. */
export const TIME_OPTIONS = Array.from({ length: 24 * 12 }, (_, index) => {
  const value = `${String(Math.floor(index / 12)).padStart(2, "0")}:${String((index % 12) * 5).padStart(2, "0")}`;
  return { value, label: formatTime(value) };
});

const cairoFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: ACADEMY_TIME_ZONE,
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

/** The academy wall clock as a sortable "YYYY-MM-DD HH:mm:ss" string. */
export function academyNow(now: Date = new Date()) {
  const parts = Object.fromEntries(cairoFormat.formatToParts(now).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

/** The academy's calendar date, "YYYY-MM-DD". */
export function academyToday(now: Date = new Date()) {
  return academyNow(now).slice(0, 10);
}

/** A one-off is past once the Cairo wall clock moves beyond its end time. */
export function isPastOneOff(occursOn: string, endsAt: string, now: Date = new Date()) {
  return `${occursOn} ${endsAt.slice(0, 5)}:00` < academyNow(now);
}

/**
 * Parses typed times such as "4", "4pm", "4:30 pm", "1630", or "16:30" into "HH:mm", or null.
 * Without AM/PM, 1–6 read as afternoon and 7–11 as morning, which fits class hours.
 */
export function parseTimeInput(text: string) {
  const match = text.trim().toLowerCase().replace(/\./g, "").match(/^(\d{1,2})(?::?(\d{2}))?\s*(a|p)?m?$/);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3];
  if (minutes > 59) return null;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (meridiem === "p" ? 12 : 0);
  } else if (hours >= 1 && hours <= 6) hours += 12;
  if (hours > 23) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
