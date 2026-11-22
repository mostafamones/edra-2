import { createClient } from "@/lib/supabase/client";
import { fetchAllPages } from "@/lib/supabase/paginate";
import type { Database } from "@/lib/supabase/database.types";
import { attendanceRowSchema as rowSchema } from "./summary";

export { studentAttendanceSummary, type StudentAttendanceRow } from "./summary";

type ViewRow = Pick<Database["public"]["Views"]["counted_attendance"]["Row"], "session_id" | "session_started_at" | "status" | "mandatory">;

/** Official attendance only. The counted view excludes archived sessions and retains RLS. */
export async function loadStudentAttendance(academyId: string, yearId: string, recordId: string, signal: AbortSignal) {
  const db = createClient();
  const rows = await fetchAllPages<ViewRow>((from, to) => db.from("counted_attendance")
    .select("session_id,session_started_at,status,mandatory")
    .eq("academy_id", academyId).eq("academic_year_id", yearId).eq("annual_student_record_id", recordId)
    .order("session_started_at", { ascending: false }).order("session_id").range(from, to).abortSignal(signal));
  return rows.map(row => rowSchema.parse(row));
}

