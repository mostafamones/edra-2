import { createClient } from "@/lib/supabase/client";
import { fetchAllPages } from "@/lib/supabase/paginate";
import { loadActiveYear } from "@/modules/groups";
import type { Tables } from "@/lib/supabase/database.types";

export type Schedule = Pick<Tables<"schedules">,
  "id" | "academy_id" | "academic_year_id" | "title" | "kind" | "audience" | "group_id" | "level_id" | "track_id"
  | "mandatory" | "location" | "archived_at" | "created_by">;
export type ScheduleSession = Pick<Tables<"schedule_sessions">, "id" | "academy_id" | "academic_year_id" | "schedule_id" | "occurs_on" | "starts_at" | "ends_at">;
export type ScheduleSlot = Pick<Tables<"schedule_slots">, "id" | "academy_id" | "academic_year_id" | "schedule_id" | "weekday" | "starts_at" | "ends_at">;

const SCHEDULE_COLUMNS = "id,academy_id,academic_year_id,title,kind,audience,group_id,level_id,track_id,mandatory,location,archived_at,created_by";
const SESSION_COLUMNS = "id,academy_id,academic_year_id,schedule_id,occurs_on,starts_at,ends_at";
const SLOT_COLUMNS = "id,academy_id,academic_year_id,schedule_id,weekday,starts_at,ends_at";

// Every key is prefixed by ["schedules", academyId] so one invalidation covers an academy's schedule data.
export const schedulesRootKey = (academyId: string) => ["schedules", academyId] as const;
export const scheduleListQueryKey = (academyId: string, archived = false) =>
  [...schedulesRootKey(academyId), "list", archived ? "archived" : "active"] as const;
export const scheduleQueryKey = (academyId: string, scheduleId: string) => [...schedulesRootKey(academyId), "detail", scheduleId] as const;

/** Active or archived schedules for the active academic year, with their weekly slots. */
export async function loadSchedules(academyId: string, options: { archived?: boolean } = {}) {
  const year = await loadActiveYear(academyId);
  if (!year) return { year: null, schedules: [] as Schedule[], slots: [] as ScheduleSlot[], sessions: [] as ScheduleSession[] };
  const db = createClient();
  const [schedules, slots, sessions] = await Promise.all([
    fetchAllPages<Schedule>((from, to) => {
      const query = db.from("schedules").select(SCHEDULE_COLUMNS)
        .eq("academy_id", academyId).eq("academic_year_id", year.id);
      return (options.archived ? query.not("archived_at", "is", null) : query.is("archived_at", null))
        .order("id").range(from, to);
    }),
    fetchAllPages<ScheduleSlot>((from, to) => db.from("schedule_slots").select(SLOT_COLUMNS)
      .eq("academy_id", academyId).eq("academic_year_id", year.id)
      .order("id").range(from, to)),
    fetchAllPages<ScheduleSession>((from, to) => db.from("schedule_sessions").select(SESSION_COLUMNS)
      .eq("academy_id", academyId).eq("academic_year_id", year.id)
      .order("id").range(from, to)),
  ]);
  // Slots and sessions are read for the whole year; keep only those whose schedule is in this list.
  const ids = new Set(schedules.map((schedule) => schedule.id));
  return { year, schedules, slots: slots.filter((slot) => ids.has(slot.schedule_id)),
    sessions: sessions.filter((session) => ids.has(session.schedule_id)) };
}

/** One schedule and its slots fetched directly by tenant and id. */
export async function loadSchedule(academyId: string, scheduleId: string) {
  const db = createClient();
  const [schedule, slots, sessions] = await Promise.all([
    db.from("schedules").select(SCHEDULE_COLUMNS).eq("academy_id", academyId).eq("id", scheduleId).maybeSingle(),
    db.from("schedule_slots").select(SLOT_COLUMNS).eq("academy_id", academyId).eq("schedule_id", scheduleId)
      .order("weekday").order("starts_at"),
    db.from("schedule_sessions").select(SESSION_COLUMNS).eq("academy_id", academyId).eq("schedule_id", scheduleId)
      .order("occurs_on").order("starts_at"),
  ]);
  if (schedule.error) throw new Error(schedule.error.message);
  if (slots.error) throw new Error(slots.error.message);
  if (sessions.error) throw new Error(sessions.error.message);
  return schedule.data ? { schedule: schedule.data as Schedule, slots: (slots.data ?? []) as ScheduleSlot[], sessions: (sessions.data ?? []) as ScheduleSession[] } : null;
}
