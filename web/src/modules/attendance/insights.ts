import type { StudentAttendanceRow } from "./student";

export type AttendanceInsight = { title: string; detail: string; evidence: StudentAttendanceRow[] };

/** Describe observed sessions only. No risk labels, inferred causes or predictions. */
export function attendanceInsights(rows: StudentAttendanceRow[]): AttendanceInsight[] {
  const mandatory = rows.filter(row => row.mandatory).sort((a,b) => b.session_started_at.localeCompare(a.session_started_at) || a.session_id.localeCompare(b.session_id));
  const recent = mandatory.slice(0,5);
  if (recent.length < 5) return [];
  const attended = (items: StudentAttendanceRow[]) => items.filter(row => row.status === "present" || row.status === "late").length;
  const absences = recent.filter(row => row.status === "absent").length;
  const result: AttendanceInsight[] = [];
  if (absences) result.push({title:`Absent in ${absences} of the last 5 finalized mandatory sessions`,detail:"Review the recorded absences and the material taught in those sessions.",evidence:recent});
  else if (attended(recent) === 5) result.push({title:"Attended the last 5 finalized mandatory sessions",detail:"Present and Late both count as attended. This does not establish learning completion.",evidence:recent});
  const previous = mandatory.slice(5,10);
  const decided = (items: StudentAttendanceRow[]) => items.every(row => ["present","late","absent"].includes(row.status));
  if (previous.length === 5 && decided(recent) && decided(previous) && attended(recent) !== attended(previous)) {
    result.push({title:`Attended ${attended(recent)} of the latest 5 sessions, compared with ${attended(previous)} of the previous 5`,detail:"Equal-sized groups of finalized mandatory sessions; dates and statuses are shown below.",evidence:mandatory.slice(0,10)});
  }
  return result.slice(0,2);
}
