// edra-dev-v7 teaching calendar. Weeks run Sunday to Saturday, Friday is free, and every session uses the one
// hall, so no two sessions overlap. Groups meet once or twice a week at varied times. A few second-of-week
// sessions are skipped (the teacher excused) and made up on that week's Friday, and each level gets an optional
// revision session on the last Friday of every month. Pure: depends only on the keyed random source.
import { addDays, weekdayOf } from "./time.mjs";

export const FRIDAY = 5;
const DURATION = 90;
// Sunday-first position of an ISO weekday (7 = Sunday ... 6 = Saturday).
export const weekPosition = (weekday) => weekday % 7;
const TEACHING_DAYS = [7, 1, 2, 3, 4, 6];
// Back-to-back 90-minute starts per day; Saturday is a weekend day, so it can start in the morning.
const WEEKDAY_TIMES = [["15:00", "16:30", "18:00", "19:30"], ["16:00", "17:30", "19:00"], ["14:30", "16:00", "17:30", "19:00"], ["17:00", "18:30", "20:00"]];
const SATURDAY_TIMES = [["10:00", "11:30", "13:00", "14:30"], ["12:00", "13:30", "15:00", "16:30"]];
// Morning make-ups end before the afternoon revisions that can share the same Friday.
const MAKE_UP_TIMES = ["10:00", "11:30", "13:00"];
const REVISION_TIMES = { "preparatory-3": "15:00", "secondary-2": "17:00" };
const LEVEL_NAMES = { "preparatory-3": "Preparatory 3", "secondary-2": "Secondary 2" };
const ONCE_SHARE = 0.35;
const SKIP_SHARE = 0.75;

const minutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

/** Weekly slots per group: no shared start in the one hall, twice-weekly days at least two days apart. */
export function planWeeklySlots(rand, groupDefs) {
  const cells = TEACHING_DAYS.flatMap((weekday) => rand.pick(weekday === 6 ? SATURDAY_TIMES : WEEKDAY_TIMES, `calendar:day:${weekday}`)
    .map((startTime) => ({ weekday, startTime })))
    .sort((a, b) => rand.unit(`calendar:cell:${a.weekday}:${a.startTime}`) - rand.unit(`calendar:cell:${b.weekday}:${b.startTime}`));
  // Younger preparatory students prefer earlier starts and secondary students later ones; either falls back.
  const prefers = (def, cell) => (def.levelKey === "preparatory-3" ? minutes(cell.startTime) < minutes("18:00") : minutes(cell.startTime) >= minutes("16:30"));
  const take = (def, ok) => {
    const index = [cells.findIndex((c) => ok(c) && prefers(def, c)), cells.findIndex(ok)].find((i) => i >= 0);
    if (index === undefined) throw new Error(`No free hall slot for ${def.key}`);
    return cells.splice(index, 1)[0];
  };
  return groupDefs.map((def) => {
    const first = take(def, () => true);
    const slots = [first];
    if (rand.unit(`calendar:once:${def.key}`) >= ONCE_SHARE) {
      slots.push(take(def, (c) => Math.abs(weekPosition(c.weekday) - weekPosition(first.weekday)) >= 2));
    }
    return slots.sort((a, b) => weekPosition(a.weekday) - weekPosition(b.weekday))
      .map(({ weekday, startTime }) => ({ weekday, startTime, durationMinutes: DURATION }));
  });
}

/** Sunday-start weeks from the first Sunday of the year up to the day before the reference date. */
export function sundayWeeks(startsOn, referenceDate) {
  const weeks = [];
  for (let start = addDays(startsOn, (7 - weekdayOf(startsOn)) % 7); start < referenceDate; start = addDays(start, 7)) weeks.push(start);
  return weeks;
}

/** Last Friday of each month that falls inside the history, after the first two teaching weeks. */
function revisionFridays(weeks, referenceDate) {
  const fridays = weeks.slice(2).map((start) => addDays(start, FRIDAY)).filter((date) => date < referenceDate);
  return fridays.filter((date) => addDays(date, 7).slice(0, 7) !== date.slice(0, 7));
}

/**
 * Every dated occurrence of the history: recurring slots (minus skipped ones), Friday make-ups and level revisions.
 * One-off schedules carry their single occurrence. Occurrence: {scheduleKey, groupKey|null, levelKey, week, date, startTime}.
 */
export function planCalendar(rand, groupDefs, weeks, referenceDate, startsOn) {
  const slotsOf = planWeeklySlots(rand, groupDefs);
  const revisions = revisionFridays(weeks, referenceDate);
  const occurrences = [];
  const oneOffs = [];
  const fridayUse = new Map();
  groupDefs.forEach((def, gi) => {
    const slots = slotsOf[gi];
    // Only a second weekly session is skipped, so each week still opens with the group's first session.
    const skipWeek = slots.length === 2 && rand.unit(`calendar:skip:${def.key}`) < SKIP_SHARE
      ? 1 + Math.floor(rand.unit(`calendar:skip-week:${def.key}`) * Math.max(1, weeks.length - 3)) : null;
    weeks.forEach((start, w) => {
      slots.forEach((slot, si) => {
        const date = addDays(start, weekPosition(slot.weekday));
        if (date < startsOn || date >= referenceDate) return;
        // The make-up is on the first Friday after the skipped session (Saturday's falls in the next week).
        const friday = addDays(date, (FRIDAY - weekPosition(slot.weekday) + 7) % 7 || 7);
        const skipped = w === skipWeek && si === 1 && friday < referenceDate;
        if (!skipped) {
          occurrences.push({ scheduleKey: `schedule:${def.key}`, groupKey: def.key, levelKey: def.levelKey, week: w, date, startTime: slot.startTime, weekday: slot.weekday });
          return;
        }
        const used = fridayUse.get(friday) ?? 0;
        fridayUse.set(friday, used + 1);
        const key = `schedule:make-up:${def.key}:w${String(w + 1).padStart(2, "0")}`;
        const occurrence = { scheduleKey: key, groupKey: def.key, levelKey: def.levelKey, week: weeks.findIndex((s) => s <= friday && friday <= addDays(s, 6)), date: friday, startTime: MAKE_UP_TIMES[used] };
        oneOffs.push({ key, title: `${def.name} make-up`, audience: "group", groupKey: def.key, levelKey: null, mandatory: true, skipped: date, occurrence });
        occurrences.push(occurrence);
      });
    });
  });
  for (const date of revisions) {
    const w = weeks.findIndex((start) => start <= date && date <= addDays(start, 6));
    for (const levelKey of [...new Set(groupDefs.map((d) => d.levelKey))]) {
      const key = `schedule:revision:${levelKey}:${date.slice(0, 7)}`;
      const occurrence = { scheduleKey: key, groupKey: null, levelKey, week: w, date, startTime: REVISION_TIMES[levelKey] };
      oneOffs.push({ key, title: `${LEVEL_NAMES[levelKey]} revision`, audience: "level", groupKey: null, levelKey, mandatory: false, occurrence });
      occurrences.push(occurrence);
    }
  }
  return { slotsOf, oneOffs, occurrences, durationMinutes: DURATION };
}

/** Problems with a planned calendar: overlapping sessions in the hall or recurring work on a Friday. */
export function calendarProblems(sessions, cairoWeekday) {
  const problems = [];
  const sorted = [...sessions].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  sorted.forEach((session, i) => {
    if (i > 0 && Date.parse(session.startsAt) < Date.parse(sorted[i - 1].endsAt)) problems.push(`${session.key} overlaps ${sorted[i - 1].key}`);
    if (session.recurring && cairoWeekday(session.startsAt) === FRIDAY) problems.push(`${session.key} is a recurring session on a Friday`);
  });
  return problems;
}
