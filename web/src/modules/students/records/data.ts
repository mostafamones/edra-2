import { z } from "zod";

import { fetchAllPages } from "@/lib/supabase/paginate";
import { createClient } from "@/lib/supabase/server";
import type { StaffRole } from "./permissions";
import type { StudentListParams } from "./list-params";
import { onlineAccountState } from "./validation";
import type {
  GroupChangePreview, GroupChangeRow, RecordVersion, StudentListResult, StudentRecord, StudentRecordRow,
} from "./types";
import type { Database } from "@/lib/supabase/database.types";

type ListArgs = Database["public"]["Functions"]["list_student_records"]["Args"];
type Nullable<T> = { [K in keyof T]: T[K] | null };

/**
 * Server-only data access for staff student records. Every read verifies the caller's academy
 * membership and runs through the caller's Supabase session, so RLS applies as well.
 */

export type StaffContext = { db: Awaited<ReturnType<typeof createClient>>; userId: string; role: StaffRole };

export type ReadResult<T> = { ok: true; data: T } | { ok: false; status: 400 | 401 | 403 | 404 | 500 };

/** The signed-in user's session and role in the academy, or null when they are not a member. */
export async function staffContext(academyId: string): Promise<StaffContext | null> {
  if (!z.uuid().safeParse(academyId).success) return null;
  const db = await createClient();
  const { data: auth } = await db.auth.getClaims();
  if (!auth?.claims) return null;
  const { data } = await db.from("academy_memberships").select("role")
    .eq("academy_id", academyId).eq("user_id", auth.claims.sub).is("suspended_at", null).maybeSingle();
  return data ? { db, userId: auth.claims.sub, role: data.role } : null;
}

async function openYearId(db: StaffContext["db"], academyId: string) {
  const { data, error } = await db.from("academic_years").select("id")
    .eq("academy_id", academyId).is("closed_at", null).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.id ?? null;
}

const listRowSchema = z.object({
  id: z.string(),
  academy_student_profile_id: z.string(),
  full_name: z.string(),
  student_phone: z.string(),
  parent_phone: z.string(),
  level_id: z.string(),
  level_name: z.string(),
  track_id: z.string().nullable(),
  track_name: z.string().nullable(),
  primary_group_id: z.string().nullable(),
  group_name: z.string().nullable(),
  participation_type: z.enum(["in_person", "online_only"]),
  archived_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  version: z.number().int(),
  online_account: z.enum(["not_connected", "connected", "suspended"]),
});
const listResponseSchema = z.object({ rows: z.array(listRowSchema), total: z.number().int().nonnegative() });

const toRow = (row: z.infer<typeof listRowSchema>): StudentRecordRow => ({
  id: row.id,
  academyStudentProfileId: row.academy_student_profile_id,
  fullName: row.full_name,
  studentPhone: row.student_phone,
  parentPhone: row.parent_phone,
  levelId: row.level_id,
  levelName: row.level_name,
  trackId: row.track_id,
  trackName: row.track_name,
  primaryGroupId: row.primary_group_id,
  groupName: row.group_name,
  participationType: row.participation_type,
  archivedAt: row.archived_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  version: row.version,
  onlineAccount: row.online_account,
});

/** One page of the academy's records for its open academic year. */
export async function listStudentRecords(academyId: string, params: StudentListParams): Promise<ReadResult<StudentListResult>> {
  const actor = await staffContext(academyId);
  if (!actor) return { ok: false, status: 403 };
  try {
    const academicYearId = await openYearId(actor.db, academyId);
    if (!academicYearId) {
      return { ok: true, data: { academicYearId: null, rows: [], total: 0, yearTotal: 0, pageIndex: 0, pageSize: params.pageSize } };
    }
    const args: Nullable<ListArgs> = {
      p_academy_id: academyId,
      p_academic_year_id: academicYearId,
      p_search: params.search.trim() || null,
      p_status: params.status,
      p_level_id: params.levelId,
      p_track: params.track,
      p_group: params.group,
      p_participation_type: params.participationType,
      p_sorts: params.sorts,
      p_page_index: params.pageIndex,
      p_page_size: params.pageSize,
    };
    // The generator types RPC arguments as non-null; the function treats NULL filters as "any".
    const [{ data, error }, year] = await Promise.all([
      actor.db.rpc("list_student_records", args as ListArgs),
      actor.db.from("annual_student_records").select("id", { count: "exact", head: true })
        .eq("academy_id", academyId).eq("academic_year_id", academicYearId),
    ]);
    if (year.error || year.count === null) return { ok: false, status: 500 };
    if (error) return { ok: false, status: error.code === "P0001" && error.message === "validation" ? 400 : 500 };
    const parsed = listResponseSchema.parse(data);
    return {
      ok: true,
      data: { academicYearId, rows: parsed.rows.map(toRow), total: parsed.total, yearTotal: year.count, pageIndex: params.pageIndex, pageSize: params.pageSize },
    };
  } catch {
    return { ok: false, status: 500 };
  }
}

const RECORD_COLUMNS = "id,academy_id,academic_year_id,academy_student_profile_id,full_name,student_phone,parent_phone,level_id,track_id,primary_group_id,participation_type,archived_at,created_at,updated_at,version";

/** One record fetched fresh by tenant and id, for the edit sheet. */
export async function getStudentRecord(academyId: string, recordId: string): Promise<ReadResult<StudentRecord>> {
  if (!z.uuid().safeParse(recordId).success) return { ok: false, status: 400 };
  const actor = await staffContext(academyId);
  if (!actor) return { ok: false, status: 403 };
  const { data, error } = await actor.db.from("annual_student_records").select(RECORD_COLUMNS)
    .eq("academy_id", academyId).eq("id", recordId).maybeSingle();
  if (error) return { ok: false, status: 500 };
  if (!data) return { ok: false, status: 404 };
  const { data: profile, error: profileError } = await actor.db.from("academy_student_profiles")
    .select("user_id,access_suspended_at").eq("academy_id", academyId).eq("id", data.academy_student_profile_id).maybeSingle();
  if (profileError) return { ok: false, status: 500 };
  return {
    ok: true,
    data: {
      onlineAccount: onlineAccountState(profile?.user_id, data.archived_at, profile?.access_suspended_at),
      id: data.id,
      academyId: data.academy_id,
      academicYearId: data.academic_year_id,
      academyStudentProfileId: data.academy_student_profile_id,
      fullName: data.full_name,
      studentPhone: data.student_phone,
      parentPhone: data.parent_phone,
      levelId: data.level_id,
      trackId: data.track_id,
      primaryGroupId: data.primary_group_id,
      participationType: data.participation_type,
      archivedAt: data.archived_at,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      version: data.version,
    },
  };
}

const SELECTION_CHUNK = 100;

/**
 * Fresh details for a bulk group change: every selected record's current placement and group, the
 * proposed destination, and anything that blocks the change (missing, changed since selection,
 * archived, or not in the destination's level, or its track when the destination is track-specific). `destination` is a group id, null for
 * Unassigned, or undefined while none is chosen.
 */
export async function loadGroupChangePreview(
  actor: StaffContext, scope: { academyId: string; academicYearId: string }, selection: RecordVersion[], destination: string | null | undefined,
): Promise<GroupChangePreview | null> {
  const ids = selection.map((entry) => entry.id);
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += SELECTION_CHUNK) chunks.push(ids.slice(index, index + SELECTION_CHUNK));
  const [recordPages, levels, tracks, groups] = await Promise.all([
    Promise.all(chunks.map((chunk) => actor.db.from("annual_student_records")
      .select("id,full_name,level_id,track_id,primary_group_id,archived_at,version")
      .eq("academy_id", scope.academyId).eq("academic_year_id", scope.academicYearId).in("id", chunk))),
    actor.db.from("global_levels").select("id,name"),
    actor.db.from("academy_tracks").select("id,name").eq("academy_id", scope.academyId),
    fetchAllPages<{ id: string; name: string; level_id: string; track_id: string | null; archived_at: string | null }>((from, to) =>
      actor.db.from("groups").select("id,name,level_id,track_id,archived_at")
        .eq("academy_id", scope.academyId).eq("academic_year_id", scope.academicYearId).order("id").range(from, to)),
  ]);
  if (levels.error || tracks.error || recordPages.some((page) => page.error)) throw new Error("Could not load the selection");
  const levelNames = new Map((levels.data ?? []).map((level) => [level.id, level.name]));
  const trackNames = new Map((tracks.data ?? []).map((track) => [track.id, track.name]));
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const records = new Map(recordPages.flatMap((page) => page.data ?? []).map((record) => [record.id, record]));

  const target = destination ? groupById.get(destination) : undefined;
  if (destination && (!target || target.archived_at)) return null;

  const levelIds = new Set<string>();
  const trackIds = new Set<string>();
  const problems = { missing: 0, stale: 0, archived: 0, incompatible: 0 };
  let changed = 0;
  let unchanged = 0;
  const rows: GroupChangeRow[] = selection.map(({ id, version }) => {
    const record = records.get(id);
    if (!record) {
      problems.missing++;
      return {
        id, fullName: null, levelId: null, levelName: null, trackId: null, trackName: null,
        currentGroupId: null, currentGroupName: null, version: null, archived: false, problem: "missing", changes: false,
      };
    }
    levelIds.add(record.level_id);
    trackIds.add(record.track_id ?? "");
    const problem = record.version !== version ? "stale"
      : record.archived_at ? "archived"
        : target && (target.level_id !== record.level_id || (target.track_id !== null && target.track_id !== record.track_id)) ? "incompatible"
          : null;
    if (problem) problems[problem]++;
    const changes = destination !== undefined && (destination ?? null) !== record.primary_group_id;
    if (destination !== undefined && !problem) {
      if (changes) changed++;
      else unchanged++;
    }
    return {
      id,
      fullName: record.full_name,
      levelId: record.level_id,
      levelName: levelNames.get(record.level_id) ?? record.level_id,
      trackId: record.track_id,
      trackName: record.track_id ? trackNames.get(record.track_id) ?? null : null,
      currentGroupId: record.primary_group_id,
      currentGroupName: record.primary_group_id ? groupById.get(record.primary_group_id)?.name ?? null : null,
      version: record.version,
      archived: Boolean(record.archived_at),
      problem,
      changes,
    };
  });
  const [onlyLevel] = levelIds;
  const [onlyTrack] = trackIds;
  return {
    destination: destination === undefined ? undefined : target ? {
      id: target.id,
      name: target.name,
      levelName: levelNames.get(target.level_id) ?? target.level_id,
      trackName: target.track_id ? trackNames.get(target.track_id) ?? null : null,
    } : null,
    rows,
    changed,
    unchanged,
    problems,
    program: levelIds.size === 1 ? { levelId: onlyLevel, trackId: trackIds.size === 1 && onlyTrack ? onlyTrack : null } : null,
  };
}
