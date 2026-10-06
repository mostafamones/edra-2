import { ACADEMY_TIME_ZONE } from "@/modules/schedules";

const startedFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: ACADEMY_TIME_ZONE, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
});
const timeFormat = new Intl.DateTimeFormat("en-US", { timeZone: ACADEMY_TIME_ZONE, hour: "numeric", minute: "2-digit" });

/** A server timestamp on the academy clock, e.g. "Mon, Oct 5, 4:52 PM". */
export function formatMoment(iso: string) {
  return startedFormat.format(new Date(iso));
}

/** A weekday and date on the academy clock, e.g. "Mon, Oct 5". */
export function formatDay(iso: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: ACADEMY_TIME_ZONE, weekday: "short", month: "short", day: "numeric" }).format(new Date(iso));
}

/** The academy-clock calendar date of an instant, as "YYYY-MM-DD". */
export function academyDate(iso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ACADEMY_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

/** The academy-clock day and month, e.g. "05/10". */
export function formatDayMonth(iso: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: ACADEMY_TIME_ZONE, day: "2-digit", month: "2-digit" }).formatToParts(new Date(iso));
  return `${parts.find((part) => part.type === "day")?.value}/${parts.find((part) => part.type === "month")?.value}`;
}

/** Egyptian mobile as "+20 10 1234 5678". */
export function formatPhone(phone: string) {
  const match = /^\+20(\d{2})(\d{4})(\d{4})$/.exec(phone);
  return match ? `+20 ${match[1]} ${match[2]} ${match[3]}` : phone;
}

/** Only the academy clock time, e.g. "4:52 PM". */
export function formatClock(iso: string) {
  return timeFormat.format(new Date(iso));
}

/** "Sunday A · Grade 10 · Science", "Grade 10 · Whole level", or "Grade 10 · Science". */
export function sessionAudience(session: {
  audience: "group" | "level" | "program"; groupName: string | null; levelName: string | null; levelId: string; trackName: string | null;
}) {
  return [
    session.audience === "group" ? session.groupName ?? "Group" : null,
    session.levelName ?? session.levelId,
    session.audience === "level" ? "Whole level" : session.trackName,
  ].filter(Boolean).join(" · ");
}

export const startedByLabel = (name: string | null) => name ?? "A staff member";
