import { searchScore } from "@/lib/search";
import { audienceLabel, type AudienceLookup, type Schedule, type ScheduleSession, type ScheduleSlot } from "@/modules/schedules";
import { isoWeekday } from "./upcoming";

export type AudienceFilter = { grade: string; track: string; group: string };
export const ANY_AUDIENCE: AudienceFilter = { grade: "", track: "", group: "" };
export type AudienceFacet = keyof AudienceFilter;

/** Group schedules store their placement on the group, rather than on the schedule. */
export function scheduleAudience(schedule: Schedule, lookup: AudienceLookup) {
  const group = schedule.audience === "group" && schedule.group_id ? lookup.groups.get(schedule.group_id) : null;
  return {
    grade: group ? group.level_id : schedule.level_id ?? "",
    track: group ? group.track_id ?? "" : schedule.track_id ?? "",
    group: schedule.audience === "group" ? schedule.group_id ?? "" : "",
  };
}

export function filterSchedules(schedules: Schedule[], lookup: AudienceLookup, filter: AudienceFilter, query = "") {
  return schedules.filter(schedule => {
    const audience = scheduleAudience(schedule, lookup);
    return !schedule.archived_at && (!filter.grade || filter.grade === audience.grade)
      && (!filter.track || filter.track === audience.track) && (!filter.group || filter.group === audience.group)
      && searchScore(`${schedule.title} ${audienceLabel(schedule, lookup)} ${schedule.location ?? ""}`, query) !== null;
  }).sort((a, b) => {
    const score = (schedule: Schedule) => searchScore(schedule.title, query) ?? searchScore(`${audienceLabel(schedule, lookup)} ${schedule.location ?? ""}`, query) ?? 0;
    return score(b) - score(a) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
  });
}

/** Today's planned times are suggestions only: every active schedule remains startable. */
export function todayTime(id: string, slots: ScheduleSlot[], dates: ScheduleSession[], wall: string) {
  const today = wall.slice(0, 10), now = wall.slice(11, 16);
  const times = [...slots.filter(slot => slot.weekday === isoWeekday(today)), ...dates.filter(date => date.occurs_on === today)]
    .filter(time => time.schedule_id === id)
    .sort((a, b) => Number(a.ends_at.slice(0, 5) <= now) - Number(b.ends_at.slice(0, 5) <= now) || a.starts_at.localeCompare(b.starts_at));
  const time = times[0];
  return time ? { startsAt: time.starts_at, endsAt: time.ends_at, passed: time.ends_at.slice(0, 5) <= now } : null;
}

export function audienceChoices(schedules: Schedule[], lookup: AudienceLookup, filter: AudienceFilter, facet: AudienceFacet) {
  const parent = facet === "grade" ? ANY_AUDIENCE : { grade: filter.grade, track: facet === "group" ? filter.track : "", group: "" };
  const choices = new Map<string, { id: string; label: string; count: number }>();
  for (const schedule of filterSchedules(schedules, lookup, parent)) {
    const audience = scheduleAudience(schedule, lookup), id = audience[facet];
    if (!id) continue;
    const grade = lookup.levelNames[audience.grade] ?? audience.grade;
    const track = lookup.tracks.get(audience.track)?.name;
    const label = facet === "grade" ? grade : facet === "track" ? `${track ?? id} · ${grade}`
      : [lookup.groups.get(id)?.name ?? id, grade, track].filter(Boolean).join(" · ");
    const previous = choices.get(id);
    choices.set(id, { id, label, count: (previous?.count ?? 0) + 1 });
  }
  return [...choices.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function selectAudience(filter: AudienceFilter, facet: AudienceFacet, id: string, lookup: AudienceLookup): AudienceFilter {
  if (facet === "grade") return { grade: id, track: "", group: "" };
  if (facet === "track") return { grade: id ? lookup.tracks.get(id)?.level_id ?? filter.grade : filter.grade, track: id, group: "" };
  const group = lookup.groups.get(id);
  return group ? { grade: group.level_id, track: group.track_id ?? "", group: id } : { ...filter, group: "" };
}
