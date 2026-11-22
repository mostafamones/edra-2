import "@tanstack/react-start/server-only";

import type { Db } from "@/lib/supabase/authority";
import { fetchAllPages } from "@/lib/supabase/paginate";
import { attendanceRowSchema, optionalParticipation, studentAttendanceSummary, type StudentAttendanceRow } from "./summary";

/**
 * One annual record's finalized attendance for staff, read as the caller (RLS applies). Summaries cover the record's
 * whole counted history (archived sessions excluded by `counted_attendance`); only `items` is paged. The caller has
 * already confirmed academy membership and that the record and year belong together.
 */
export async function studentAttendanceHistory(
  db: Db, scope: { academyId: string; academicYearId: string; recordId: string }, limit: number, offset: number,
) {
  const rows: StudentAttendanceRow[] = (await fetchAllPages<unknown>((from, to) => db.from("counted_attendance")
    .select("session_id,session_started_at,status,mandatory")
    .eq("academy_id", scope.academyId).eq("academic_year_id", scope.academicYearId).eq("annual_student_record_id", scope.recordId)
    .order("session_started_at", { ascending: false }).order("session_id").range(from, to)))
    .map(row => attendanceRowSchema.parse(row));
  const page = rows.slice(offset, offset + limit);
  const sessions = new Map<string, { schedule_title: string; group_name: string | null }>();
  if (page.length) {
    const { data, error } = await db.from("sessions").select("id,schedule_title,group_name")
      .eq("academy_id", scope.academyId).in("id", page.map(row => row.session_id));
    if (error) throw new Error(error.message);
    for (const session of data ?? []) sessions.set(session.id, session);
  }
  return {
    total: rows.length,
    mandatory: studentAttendanceSummary(rows),
    optional: optionalParticipation(rows),
    items: page.map(row => ({
      sessionId: row.session_id,
      startedAt: row.session_started_at,
      title: sessions.get(row.session_id)?.schedule_title ?? null,
      groupName: sessions.get(row.session_id)?.group_name ?? null,
      status: row.status,
      mandatory: row.mandatory,
    })),
  };
}
