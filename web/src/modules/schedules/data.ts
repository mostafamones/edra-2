import "server-only";

import type { Authority } from "@/lib/supabase/authority";
import { academyMember } from "@/lib/supabase/membership";
import { fetchAllPages } from "@/lib/supabase/paginate";
import type { Database } from "@/lib/supabase/database.types";
import { ACADEMY_TIME_ZONE, academyNow } from "./time";

/**
 * Server-only schedule reads for the external API. Reads run as the caller (RLS active) after an
 * active-membership check. Pass `authority` for token-authenticated requests.
 */

type Enums = Database["public"]["Enums"];

export const MAX_SCHEDULE_PAGE = 100;
export const DEFAULT_SCHEDULE_PAGE = 50;
export const MAX_SCHEDULE_SEARCH = 100;

export type StartableSchedule = {
  id: string;
  title: string;
  kind: Enums["schedule_kind"];
  audience: Enums["schedule_audience"];
  mandatory: boolean;
  location: string | null;
  groupId: string | null;
  groupName: string | null;
  levelId: string | null;
  levelName: string | null;
  trackId: string | null;
  trackName: string | null;
  /** Weekly slots of a recurring schedule, academy-local "HH:mm:ss" times; ISO weekday 1 = Monday. */
  slots: { weekday: number; startsAt: string; endsAt: string }[];
  /** Dated meetings of a one-off schedule, academy-local dates and times. */
  meetings: { occursOn: string; startsAt: string; endsAt: string }[];
  /** Planned for the academy's current day. A grouping hint only: any listed schedule can start. */
  meetsToday: boolean;
  /** The schedule's live session; starting opens it instead of creating another. */
  liveSessionId: string | null;
  /** Whether the caller may start it now. A hint for the UI; the start command re-checks. */
  canStart: boolean;
};

export type StartableSchedulePage = {
  timeZone: string;
  /** The academy's current calendar day, "YYYY-MM-DD". */
  today: string;
  /** The open academic year, or null when none is open (then nothing can start). */
  academicYear: { id: string; startYear: number } | null;
  schedules: StartableSchedule[];
  /** Pass back as `offset` for the next page; null on the last page. */
  nextOffset: number | null;
};

export type ScheduleQuery = { academyId: string; search?: string | null; limit?: number | null; offset?: number | null };
export type ScheduleReadResult<T> = { ok: true; data: T } | { ok: false; status: 400 | 403 | 500 };

/** Escapes LIKE wildcards so search text matches literally. */
const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** ISO weekday (1 = Monday … 7 = Sunday) of a "YYYY-MM-DD" calendar date. */
const isoWeekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay() || 7;

/**
 * Active schedules of the open academic year that staff can start a session from, ordered by title,
 * with their planned slots or meetings. Off-day and future-dated schedules are included: planned
 * times never restrict starting. Archived schedules are excluded.
 */
export async function listStartableSchedules(query: ScheduleQuery, authority?: Authority | null, now = new Date()): Promise<ScheduleReadResult<StartableSchedulePage>> {
  const limit = query.limit ?? DEFAULT_SCHEDULE_PAGE;
  const offset = query.offset ?? 0;
  const search = query.search?.trim() ?? "";
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SCHEDULE_PAGE || !Number.isInteger(offset) || offset < 0
    || search.length > MAX_SCHEDULE_SEARCH) {
    return { ok: false, status: 400 };
  }
  const caller = await academyMember(query.academyId, authority);
  if (!caller) return { ok: false, status: 403 };
  const db = caller.db;
  const today = academyNow(now).slice(0, 10);
  const empty = { timeZone: ACADEMY_TIME_ZONE, today, academicYear: null, schedules: [], nextOffset: null };
  try {
    const year = await db.from("academic_years").select("id,start_year")
      .eq("academy_id", query.academyId).is("closed_at", null).maybeSingle();
    if (year.error) return { ok: false, status: 500 };
    if (!year.data) return { ok: true, data: empty };

    let schedulesQuery = db.from("schedules").select("id,title,kind,audience,group_id,level_id,track_id,mandatory,location")
      .eq("academy_id", query.academyId).eq("academic_year_id", year.data.id).is("archived_at", null);
    if (search) schedulesQuery = schedulesQuery.ilike("title", likePattern(search));
    // One extra row tells whether another page exists.
    const listed = await schedulesQuery.order("title").order("id").range(offset, offset + limit);
    if (listed.error) return { ok: false, status: 500 };
    const rows = listed.data.slice(0, limit);
    const ids = rows.map((row) => row.id);
    const groupIds = [...new Set(rows.flatMap((row) => (row.group_id ? [row.group_id] : [])))];

    const [slots, meetings, groups, live] = await Promise.all([
      fetchAllPages<{ id: string; schedule_id: string; weekday: number; starts_at: string; ends_at: string }>((from, to) =>
        db.from("schedule_slots").select("id,schedule_id,weekday,starts_at,ends_at").eq("academy_id", query.academyId)
          .in("schedule_id", ids).order("weekday").order("starts_at").order("id").range(from, to)),
      fetchAllPages<{ id: string; schedule_id: string; occurs_on: string; starts_at: string; ends_at: string }>((from, to) =>
        db.from("schedule_sessions").select("id,schedule_id,occurs_on,starts_at,ends_at").eq("academy_id", query.academyId)
          .in("schedule_id", ids).order("occurs_on").order("starts_at").order("id").range(from, to)),
      groupIds.length
        ? db.from("groups").select("id,name,level_id,track_id").eq("academy_id", query.academyId).in("id", groupIds)
        : Promise.resolve({ data: [], error: null }),
      // Live and not yet past its automatic close (reads report an expired session as ended).
      db.from("sessions").select("id,schedule_id").eq("academy_id", query.academyId).in("schedule_id", ids)
        .eq("state", "live").is("archived_at", null).gt("auto_end_at", now.toISOString()),
    ]);
    if (groups.error || live.error) return { ok: false, status: 500 };
    const groupById = new Map((groups.data ?? []).map((group) => [group.id, group]));

    // A group schedule's level and track come from its group.
    const placement = rows.map((row) => {
      const group = row.group_id ? groupById.get(row.group_id) : undefined;
      return row.audience === "group"
        ? { levelId: group?.level_id ?? null, trackId: group?.track_id ?? null }
        : { levelId: row.level_id, trackId: row.track_id };
    });
    const levelIds = [...new Set(placement.flatMap((p) => (p.levelId ? [p.levelId] : [])))];
    const trackIds = [...new Set(placement.flatMap((p) => (p.trackId ? [p.trackId] : [])))];
    const [levels, tracks] = await Promise.all([
      levelIds.length ? db.from("global_levels").select("id,name").in("id", levelIds) : Promise.resolve({ data: [], error: null }),
      trackIds.length
        ? db.from("academy_tracks").select("id,name").eq("academy_id", query.academyId).in("id", trackIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (levels.error || tracks.error) return { ok: false, status: 500 };
    const levelNames = new Map((levels.data ?? []).map((level) => [level.id, level.name]));
    const trackNames = new Map((tracks.data ?? []).map((track) => [track.id, track.name]));
    const liveBySchedule = new Map((live.data ?? []).map((session) => [session.schedule_id, session.id]));
    const weekday = isoWeekday(today);

    return {
      ok: true,
      data: {
        ...empty,
        academicYear: { id: year.data.id, startYear: year.data.start_year },
        schedules: rows.map((row, index) => {
          const { levelId, trackId } = placement[index];
          const own = slots.filter((slot) => slot.schedule_id === row.id).map((slot) => ({ weekday: slot.weekday, startsAt: slot.starts_at, endsAt: slot.ends_at }));
          const dated = meetings.filter((meeting) => meeting.schedule_id === row.id)
            .map((meeting) => ({ occursOn: meeting.occurs_on, startsAt: meeting.starts_at, endsAt: meeting.ends_at }));
          return {
            id: row.id,
            title: row.title,
            kind: row.kind,
            audience: row.audience,
            mandatory: row.mandatory,
            location: row.location,
            groupId: row.group_id,
            groupName: row.group_id ? groupById.get(row.group_id)?.name ?? null : null,
            levelId,
            levelName: levelId ? levelNames.get(levelId) ?? null : null,
            trackId,
            trackName: trackId ? trackNames.get(trackId) ?? null : null,
            slots: own,
            meetings: dated,
            meetsToday: own.some((slot) => slot.weekday === weekday) || dated.some((meeting) => meeting.occursOn === today),
            liveSessionId: liveBySchedule.get(row.id) ?? null,
            // Every active staff role may start any active schedule of the open year.
            canStart: true,
          };
        }),
        nextOffset: listed.data.length > limit ? offset + limit : null,
      },
    };
  } catch {
    return { ok: false, status: 500 };
  }
}
