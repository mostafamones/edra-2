import { createClient } from "@/lib/supabase/client";
import { fetchAllPages } from "@/lib/supabase/paginate";

export type AcademicYear = { id: string; academy_id: string; start_year: number; starts_on: string; ends_on: string };
export type Level = { level_id: string; sort_order: number };
export type Track = { id: string; level_id: string; name: string; sort_order: number };
export type Group = {
  id: string;
  academy_id: string;
  academic_year_id: string;
  level_id: string;
  track_id: string | null;
  name: string;
  capacity: number | null;
  notes: string | null;
  archived_at: string | null;
};

const GROUP_COLUMNS = "id,academy_id,academic_year_id,level_id,track_id,name,capacity,notes,archived_at";

// Every key is prefixed by ["groups", academyId] so one invalidation covers an academy's group data.
export const groupsRootKey = (academyId: string) => ["groups", academyId] as const;
export const academicYearQueryKey = (academyId: string) => [...groupsRootKey(academyId), "year"] as const;
export const structureQueryKey = (academyId: string) => [...groupsRootKey(academyId), "structure"] as const;
export const groupListQueryKey = (academyId: string, archived: boolean) =>
  [...groupsRootKey(academyId), "list", archived ? "archived" : "active"] as const;
export const groupQueryKey = (academyId: string, groupId: string) => [...groupsRootKey(academyId), "detail", groupId] as const;
/** Which groups have schedules. Schedule mutations invalidate this key. */
export const groupDependencyQueryKey = (academyId: string) => [...groupsRootKey(academyId), "dependencies"] as const;

/** The academy's active academic year, or null when none is open. */
export async function loadActiveYear(academyId: string): Promise<AcademicYear | null> {
  const { data, error } = await createClient()
    .from("academic_years")
    .select("id,academy_id,start_year,starts_on,ends_on")
    .eq("academy_id", academyId)
    .is("closed_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  // starts_on/ends_on are generated columns, typed nullable by the generator but never null.
  return data?.starts_on && data.ends_on ? { ...data, starts_on: data.starts_on, ends_on: data.ends_on } : null;
}

/** Levels, tracks, and display names for an academy; independent of the academic year. */
export async function loadStructure(academyId: string) {
  const db = createClient();
  const [levels, tracks, names] = await Promise.all([
    db.from("academy_levels").select("level_id,sort_order").eq("academy_id", academyId).order("sort_order"),
    db.from("academy_tracks").select("id,level_id,name,sort_order").eq("academy_id", academyId).order("sort_order"),
    db.from("global_levels").select("id,name"),
  ]);
  for (const result of [levels, tracks, names]) if (result.error) throw new Error(result.error.message);
  return {
    levels: (levels.data ?? []) as Level[],
    tracks: (tracks.data ?? []) as Track[],
    levelNames: Object.fromEntries((names.data ?? []).map((row) => [row.id, row.name])) as Record<string, string>,
  };
}

/** Groups for the active academic year, filtered in the database and read through every page. */
export async function loadGroups(academyId: string, options: { archived?: boolean } = {}) {
  const year = await loadActiveYear(academyId);
  if (!year) return { year: null, groups: [] as Group[] };
  const db = createClient();
  const groups = await fetchAllPages<Group>((from, to) => {
    const query = db.from("groups").select(GROUP_COLUMNS)
      .eq("academy_id", academyId).eq("academic_year_id", year.id);
    return (options.archived ? query.not("archived_at", "is", null) : query.is("archived_at", null))
      .order("name").order("id").range(from, to);
  });
  return { year, groups };
}

/** One group fetched directly by its tenant and id, so edits work regardless of list size. */
export async function loadGroup(academyId: string, groupId: string): Promise<Group | null> {
  const { data, error } = await createClient().from("groups").select(GROUP_COLUMNS)
    .eq("academy_id", academyId).eq("id", groupId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Ids of groups referenced by any schedule; these groups cannot be archived or change program. */
export async function loadScheduledGroupIds(academyId: string): Promise<string[]> {
  const rows = await fetchAllPages<{ group_id: string | null; id: string }>((from, to) =>
    createClient().from("schedules").select("id,group_id").eq("academy_id", academyId)
      .not("group_id", "is", null).order("id").range(from, to));
  return [...new Set(rows.map((row) => row.group_id).filter((id): id is string => Boolean(id)))];
}
