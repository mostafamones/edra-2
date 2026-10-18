import { formatTime, weekdayName, WEEK_ORDER } from "@/modules/schedules/time";

import type { EnrollmentProgram } from "./types";

type Slot = EnrollmentProgram["groups"][number]["slots"][number];

const list = new Intl.ListFormat("en", { type: "conjunction" });

/**
 * A short recap: "Wednesdays — 5 PM · Harvard 1" when every slot shares one time and place,
 * otherwise just the days ("Mondays and Saturdays"). Null when the group has no schedule.
 */
export function describeGroupSchedule(slots: Slot[]): string | null {
  if (!slots.length) return null;
  const days = WEEK_ORDER.filter((day) => slots.some((slot) => slot.weekday === day)).map((day) => `${weekdayName(day)}s`);
  const [first] = slots;
  if (slots.some((slot) => slot.startsAt !== first.startsAt || slot.location !== first.location)) return list.format(days);
  return `${list.format(days)} — ${formatTime(first.startsAt).replace(":00", "")}${first.location ? ` · ${first.location}` : ""}`;
}
