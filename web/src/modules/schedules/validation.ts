import { z } from "zod";

export const MAX_WEEKLY_SLOTS = 20;
export const MAX_SESSIONS = 50;

// 24-hour HH:mm with real hour (00-23) and minute (00-59) bounds.
const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;
const isTime = (value: string | null): value is string => Boolean(value && TIME_OF_DAY.test(value));

type Issue = { path: (string | number)[]; message: string };

/** Timing and audience rules shared by the browser form and the server actions. */
function scheduleIssues(value: ScheduleInputShape): Issue[] {
  const issues: Issue[] = [];
  const fail = (path: (string | number)[], message: string) => issues.push({ path, message });
  const isId = (id: string | null) => Boolean(id && z.uuid().safeParse(id).success);

  if (value.title.length < 2) fail(["title"], "Enter a name of at least 2 characters.");
  if (value.title.length > 100) fail(["title"], "Keep the name to 100 characters or fewer.");
  if (value.location && value.location.length > 120) fail(["location"], "Keep the location to 120 characters or fewer.");

  if (value.audience === "group") {
    if (!isId(value.groupId)) fail(["groupId"], "Choose a group.");
    if (value.levelId || value.trackId) fail(["audience"], "A group audience cannot also target a level or track.");
  } else {
    if (!value.levelId) fail(["levelId"], "Choose a level.");
    if (value.groupId) fail(["audience"], "A level audience cannot also target a group.");
    if (value.audience === "program" && !isId(value.trackId)) fail(["trackId"], "Choose a track.");
    if (value.audience === "level" && value.trackId) fail(["audience"], "A whole-level audience cannot target a track.");
  }

  const checkTimes = (startsAt: string | null, endsAt: string | null, prefix: (string | number)[]) => {
    if (!isTime(startsAt)) fail([...prefix, "startsAt"], "Choose a start time.");
    if (!isTime(endsAt)) fail([...prefix, "endsAt"], "Choose an end time.");
    else if (isTime(startsAt) && startsAt >= endsAt) fail([...prefix, "endsAt"], "End time must be after the start time.");
  };

  if (value.kind === "recurring") {
    if (value.sessions.length) fail(["kind"], "Recurring schedules use weekly slots, not dates.");
    if (value.slots.length === 0) fail(["slots"], "Add at least one weekly slot.");
    if (value.slots.length > MAX_WEEKLY_SLOTS) fail(["slots"], `Use at most ${MAX_WEEKLY_SLOTS} weekly slots.`);
    const seen = new Set<string>();
    value.slots.forEach((slot, index) => {
      checkTimes(slot.startsAt, slot.endsAt, ["slots", index]);
      const key = `${slot.weekday}@${slot.startsAt}`;
      if (isTime(slot.startsAt) && seen.has(key))
        fail(["slots", index, "startsAt"], "Another slot already starts at this time on this day.");
      seen.add(key);
    });
  } else {
    if (value.slots.length) fail(["kind"], "One-off schedules cannot have weekly slots.");
    if (value.sessions.length === 0) fail(["sessions"], "Add at least one session.");
    if (value.sessions.length > MAX_SESSIONS) fail(["sessions"], `Use at most ${MAX_SESSIONS} sessions.`);
    const seen = new Set<string>();
    value.sessions.forEach((session, index) => {
      if (!session.date) fail(["sessions", index, "date"], "Choose a date.");
      else if (!z.iso.date().safeParse(session.date).success) fail(["sessions", index, "date"], "Choose a valid date.");
      checkTimes(session.startsAt, session.endsAt, ["sessions", index]);
      const key = `${session.date}@${session.startsAt}`;
      if (session.date && isTime(session.startsAt) && seen.has(key))
        fail(["sessions", index, "startsAt"], "Another session already starts at this time on this date.");
      seen.add(key);
    });
  }
  return issues;
}

const scheduleInputShape = z.object({
  academyId: z.uuid(),
  title: z.string().trim(),
  kind: z.enum(["recurring", "one_off"]),
  audience: z.enum(["group", "level", "program"]),
  groupId: z.string().nullable(),
  levelId: z.string().nullable(),
  trackId: z.string().nullable(),
  mandatory: z.boolean(),
  location: z.string().trim().nullable().transform((value) => value || null),
  slots: z.array(z.object({
    weekday: z.number().int().min(1).max(7),
    startsAt: z.string(),
    endsAt: z.string(),
  })),
  sessions: z.array(z.object({
    date: z.string(),
    startsAt: z.string(),
    endsAt: z.string(),
  })),
});

type ScheduleInputShape = z.output<typeof scheduleInputShape>;

/** The trusted payload accepted by the create and update actions. */
export const scheduleInputSchema = scheduleInputShape.superRefine((value, ctx) => {
  for (const issue of scheduleIssues(value)) ctx.addIssue({ code: "custom", ...issue });
});

export type ScheduleInput = z.output<typeof scheduleInputSchema>;
export type ScheduleKind = ScheduleInput["kind"];
export type ScheduleAudience = ScheduleInput["audience"];

/** Whether a one-off date falls inside the academic year (ISO dates compare lexically). */
export function withinYear(date: string, year: { starts_on: string; ends_on: string }) {
  return date >= year.starts_on && date <= year.ends_on;
}

/** Raw form state: every field is a string so inputs stay controlled while blank. */
export type ScheduleFormValues = {
  title: string;
  location: string;
  kind: ScheduleKind;
  audience: ScheduleAudience;
  groupId: string;
  levelId: string;
  trackId: string;
  mandatory: boolean;
  slots: { weekday: number; startsAt: string; endsAt: string }[];
  sessions: { date: string; startsAt: string; endsAt: string }[];
};

/** Keeps only the fields that apply to the chosen type and audience; blanks become null. */
export function toScheduleInput(values: ScheduleFormValues, academyId: string) {
  const oneOff = values.kind === "one_off";
  return {
    academyId,
    title: values.title,
    kind: values.kind,
    audience: values.audience,
    groupId: values.audience === "group" ? values.groupId || null : null,
    levelId: values.audience !== "group" ? values.levelId || null : null,
    trackId: values.audience === "program" ? values.trackId || null : null,
    mandatory: values.mandatory,
    location: values.location.trim() || null,
    slots: oneOff ? [] : values.slots.map(({ weekday, startsAt, endsAt }) => ({ weekday, startsAt, endsAt })),
    sessions: oneOff ? values.sessions.map(({ date, startsAt, endsAt }) => ({ date, startsAt, endsAt })) : [],
  };
}

/** Form-side schema: converts raw values, applies the shared rules, and checks the year boundary. */
export function scheduleFormSchema(academyId: string, year: { starts_on: string; ends_on: string }) {
  return z.custom<ScheduleFormValues>()
    .transform((values) => toScheduleInput(values, academyId))
    .pipe(scheduleInputSchema.superRefine((value, ctx) => {
      value.sessions.forEach((session, index) => {
        if (session.date && !withinYear(session.date, year))
          ctx.addIssue({ code: "custom", path: ["sessions", index, "date"], message: "Choose a date within the active academic year." });
      });
    }));
}

const BLANK_SLOT = { weekday: 6, startsAt: "", endsAt: "" };
const BLANK_SESSION = { date: "", startsAt: "", endsAt: "" };
const WEEK_POSITION: Record<number, number> = { 6: 0, 7: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6 };

type ExistingSchedule = {
  title: string; location: string | null; kind: ScheduleKind; audience: ScheduleAudience;
  group_id: string | null; level_id: string | null; track_id: string | null; mandatory: boolean;
};

/**
 * Starting values: a new schedule targets a group with mandatory attendance and one blank Saturday
 * slot; an existing schedule loads its saved values with times trimmed to HH:mm.
 */
export function scheduleFormDefaults(
  kind: ScheduleKind,
  schedule?: ExistingSchedule,
  slots: { weekday: number; starts_at: string; ends_at: string }[] = [],
  sessions: { occurs_on: string; starts_at: string; ends_at: string }[] = [],
): ScheduleFormValues {
  if (!schedule) {
    return {
      title: "", location: "", kind, audience: "group", groupId: "", levelId: "", trackId: "", mandatory: true,
      slots: [{ ...BLANK_SLOT }], sessions: [{ ...BLANK_SESSION }],
    };
  }
  const ordered = [...slots].sort((a, b) =>
    WEEK_POSITION[a.weekday] - WEEK_POSITION[b.weekday] || a.starts_at.localeCompare(b.starts_at));
  return {
    title: schedule.title,
    location: schedule.location ?? "",
    kind: schedule.kind,
    audience: schedule.audience,
    groupId: schedule.group_id ?? "",
    levelId: schedule.level_id ?? "",
    trackId: schedule.track_id ?? "",
    mandatory: schedule.mandatory,
    slots: schedule.kind === "recurring" && ordered.length
      ? ordered.map((slot) => ({ weekday: slot.weekday, startsAt: slot.starts_at.slice(0, 5), endsAt: slot.ends_at.slice(0, 5) }))
      : [{ ...BLANK_SLOT }],
    sessions: schedule.kind === "one_off" && sessions.length
      ? [...sessions]
        .sort((a, b) => a.occurs_on.localeCompare(b.occurs_on) || a.starts_at.localeCompare(b.starts_at))
        .map((session) => ({ date: session.occurs_on, startsAt: session.starts_at.slice(0, 5), endsAt: session.ends_at.slice(0, 5) }))
      : [{ ...BLANK_SESSION }],
  };
}
