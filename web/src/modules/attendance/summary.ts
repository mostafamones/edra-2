import { z } from "zod";

/** Pure attendance calculations shared by the web page and the bearer API. */

export type StudentAttendanceRow = { session_id: string; session_started_at: string; status: string; mandatory: boolean };
export const attendanceRowSchema = z.object({
  session_id: z.string(), session_started_at: z.string(), status: z.enum(["present", "late", "absent", "excused", "unknown"]), mandatory: z.boolean(),
});

const counts = (rows: StudentAttendanceRow[]) => {
  const count = (status: string) => rows.filter(row => row.status === status).length;
  return { present: count("present"), late: count("late"), absent: count("absent"), excused: count("excused"), unknown: count("unknown") };
};

/** Mandatory official values only; no qualifying records means no rate, never 0%. */
export function studentAttendanceSummary(rows: StudentAttendanceRow[]) {
  const mandatory = counts(rows.filter(row => row.mandatory));
  const denominator = mandatory.present + mandatory.late + mandatory.absent;
  return { ...mandatory, rate: denominator ? (mandatory.present + mandatory.late) / denominator * 100 : null };
}

/** Optional sessions are participation only: counted separately and never part of the mandatory rate. */
export function optionalParticipation(rows: StudentAttendanceRow[]) {
  const optional = counts(rows.filter(row => !row.mandatory));
  return { ...optional, attended: optional.present + optional.late };
}
