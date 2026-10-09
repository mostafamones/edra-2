import { z } from "zod";

import { createClient } from "@/lib/supabase/client";
import { toAssignment, toAudiencePreview, toStudentList } from "./mapper";
import type { Assignment, AssignmentAudience, AssignmentState, AudiencePreview, MarkFilter, PartKind, StudentWork } from "./types";

/** Staff reads in the browser. RLS limits every row to the caller's academies. */

// Every key is prefixed by ["assignments", academyId] so one invalidation covers an academy's assignments.
export const assignmentsRootKey = (academyId: string) => ["assignments", academyId] as const;
export const assignmentListQueryKey = (academyId: string, filters: AssignmentListFilters, page: number) =>
  [...assignmentsRootKey(academyId), "list", filters, page] as const;
export const assignmentQueryKey = (academyId: string, assignmentId: string) => [...assignmentsRootKey(academyId), "detail", assignmentId] as const;
export const marksQueryKey = (academyId: string, assignmentId: string, filter: MarkFilter) => [...assignmentsRootKey(academyId), "marks", assignmentId, filter] as const;
export const recipientsQueryKey = (academyId: string, assignmentId: string) => [...assignmentsRootKey(academyId), "recipients", assignmentId] as const;
export const yearsQueryKey = (academyId: string) => [...assignmentsRootKey(academyId), "years"] as const;
export const previewQueryKey = (academyId: string, audience: unknown) => [...assignmentsRootKey(academyId), "preview", audience] as const;

export const ALL = "all";
export type AssignmentListFilters = {
  search: string;
  yearId: string;
  /** `unarchived` hides archived assignments (the default). */
  state: AssignmentState | "unarchived" | typeof ALL;
  audience: AssignmentAudience | typeof ALL;
};
/** Archived assignments are hidden unless asked for. */
export const DEFAULT_LIST_FILTERS: Omit<AssignmentListFilters, "yearId"> = { search: "", state: "unarchived", audience: ALL };
export const LIST_PAGE_SIZE = 25;

export type AssignmentListRow = {
  id: string;
  academic_year_id: string;
  title: string;
  audience: AssignmentAudience;
  level_id: string | null;
  track_id: string | null;
  due_at: string | null;
  state: AssignmentState;
  max_score: number;
  part_count: number;
  recipient_count: number;
  updated_at: string;
  assignment_audience_groups: { group_id: string }[];
  assignment_parts: { title: string; kind: PartKind | null; position: number }[];
};

export type AcademicYearOption = { id: string; startYear: number; open: boolean };

/** Every academic year of the academy, newest first, for the year filter. */
export async function loadYears(academyId: string): Promise<AcademicYearOption[]> {
  const { data, error } = await createClient().from("academic_years").select("id,start_year,closed_at")
    .eq("academy_id", academyId).order("start_year", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((year) => ({ id: year.id, startYear: year.start_year, open: year.closed_at === null }));
}

/** Escapes LIKE wildcards so a search matches literally. */
const literal = (text: string) => text.replace(/[\\%_]/g, (match) => `\\${match}`);

/** One page of the academy's assignments, newest first, filtered in the database. */
export async function loadAssignments(academyId: string, filters: AssignmentListFilters, page: number) {
  let query = createClient().from("assignments")
    .select("id,academic_year_id,title,audience,level_id,track_id,due_at,state,max_score,part_count,recipient_count,updated_at,assignment_audience_groups(group_id),assignment_parts(title,kind,position)", { count: "exact" })
    .eq("academy_id", academyId);
  if (filters.yearId !== ALL) query = query.eq("academic_year_id", filters.yearId);
  if (filters.state === "unarchived") query = query.neq("state", "archived");
  else if (filters.state !== ALL) query = query.eq("state", filters.state);
  if (filters.audience !== ALL) query = query.eq("audience", filters.audience);
  const search = filters.search.trim();
  if (search) query = query.ilike("title", `%${literal(search)}%`);
  const from = page * LIST_PAGE_SIZE;
  const { data, error, count } = await query.order("created_at", { ascending: false }).order("id").range(from, from + LIST_PAGE_SIZE - 1);
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as unknown as AssignmentListRow[], total: count ?? 0 };
}

/** One assignment's staff view, or null when it is not in this academy. */
export async function loadAssignment(academyId: string, assignmentId: string): Promise<Assignment | null> {
  if (!z.uuid().safeParse(assignmentId).success) return null;
  const { data, error } = await createClient().rpc("get_assignment", { p_academy_id: academyId, p_assignment_id: assignmentId });
  if (error) throw new Error(error.message);
  return data === null ? null : toAssignment(data);
}

const recipientSchema = z.array(z.object({
  annual_student_record_id: z.string(),
  full_name: z.string(),
  archived: z.boolean(),
  level_id: z.string(),
  track_id: z.string().nullable(),
  group_name: z.string().nullable(),
  student_code: z.string().nullable(),
}));
export type Recipient = z.infer<typeof recipientSchema>[number];

/** The recipient snapshot with each student's current name, group, and code. */
export async function loadRecipients(academyId: string, assignmentId: string): Promise<Recipient[]> {
  const { data, error } = await createClient().rpc("list_assignment_recipients", { p_academy_id: academyId, p_assignment_id: assignmentId });
  if (error) throw new Error(error.message);
  return data === null ? [] : recipientSchema.parse(data);
}

export type AudienceQuery = {
  academicYearId: string;
  audience: AssignmentAudience;
  levelId: string | null;
  trackId: string | null;
  groupIds: string[];
};

/** Advisory count of active students the audience matches now. Saving recomputes it. */
export async function loadAudiencePreview(academyId: string, query: AudienceQuery): Promise<AudiencePreview> {
  const { data, error } = await createClient().rpc("preview_assignment_audience", {
    p_academy_id: academyId, p_academic_year_id: query.academicYearId, p_audience: query.audience,
    p_level_id: query.levelId as string, p_track_id: query.trackId as string, p_group_ids: query.groupIds,
  });
  if (error) throw new Error(error.message);
  return toAudiencePreview(data);
}

/** Every student of the assignment (up to 1000) with work status, marks, and result state. Staff only. */
export async function loadMarks(academyId: string, assignmentId: string, filter: MarkFilter = "all"): Promise<{ total: number; students: StudentWork[] }> {
  const { data, error } = await createClient().rpc("list_assignment_marks", {
    p_academy_id: academyId, p_assignment_id: assignmentId, p_filter: filter, p_limit: 1000, p_offset: 0,
  });
  if (error) throw new Error(error.message);
  const list = data === null ? { total: 0, students: [] } : toStudentList(data);
  if (list.students.length === 0) return list;
  // Filter by placement IDs so equally named groups stay distinct. Keep RLS and academy scope.
  const db = createClient();
  const batches = Array.from({ length: Math.ceil(list.students.length / 100) }, (_, index) =>
    list.students.slice(index * 100, (index + 1) * 100).map((student) => student.recordId));
  const results = await Promise.all(batches.map((ids) => db.from("annual_student_records")
    .select("id,primary_group_id,track_id,academy_tracks(name)")
    .eq("academy_id", academyId).in("id", ids)));
  for (const result of results) if (result.error) throw new Error(result.error.message);
  const placements = results.flatMap((result) => result.data ?? []);
  const byId = new Map((placements ?? []).map((row) => [row.id, {
    groupId: row.primary_group_id, trackId: row.track_id, trackName: row.academy_tracks?.name ?? null,
  }]));
  return { ...list, students: list.students.map((student) => ({ ...student, placement: byId.get(student.recordId) })) };
}
