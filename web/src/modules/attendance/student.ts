import { createClient } from "@/lib/supabase/client";
import { fetchAllPages } from "@/lib/supabase/paginate";
import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";

export type StudentAttendanceRow = { session_id: string; session_started_at: string; status: string; mandatory: boolean };
type ViewRow = Pick<Database["public"]["Views"]["counted_attendance"]["Row"], "session_id" | "session_started_at" | "status" | "mandatory">;
const rowSchema = z.object({ session_id: z.string(), session_started_at: z.string(), status: z.enum(["present", "late", "absent", "excused", "unknown"]), mandatory: z.boolean() });

/** Official attendance only. The counted view excludes archived sessions and retains RLS. */
export async function loadStudentAttendance(academyId: string, yearId: string, recordId: string, signal: AbortSignal) {
  const db = createClient();
  const rows = await fetchAllPages<ViewRow>((from, to) => db.from("counted_attendance")
    .select("session_id,session_started_at,status,mandatory")
    .eq("academy_id", academyId).eq("academic_year_id", yearId).eq("annual_student_record_id", recordId)
    .order("session_started_at", { ascending: false }).order("session_id").range(from, to).abortSignal(signal));
  return rows.map(row => rowSchema.parse(row));
}

/** Mandatory official values only; no qualifying records means no rate, never 0%. */
export function studentAttendanceSummary(rows: StudentAttendanceRow[]) {
  const mandatory = rows.filter(row => row.mandatory);
  const count = (status: string) => mandatory.filter(row => row.status === status).length;
  const present = count("present"), late = count("late"), absent = count("absent");
  const denominator = present + late + absent;
  return { present, late, absent, excused: count("excused"), unknown: count("unknown"), rate: denominator ? (present + late) / denominator * 100 : null };
}
