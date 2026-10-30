import { queryOptions } from "@tanstack/react-query";
import { loadStaffStudentLearning } from "@/modules/content";
import { loadStudentAttendance } from "@/modules/attendance";
import { loadStudentAssessments } from "@/modules/assessments";

export type StudentLearningData = Awaited<ReturnType<typeof loadStaffStudentLearning>>;
export type StudentUnit = StudentLearningData["units"][number];
export type StudentAssessmentData = Awaited<ReturnType<typeof loadStudentAssessments>>;

export const studentLearningOptions = (academyId: string, recordId: string, page = 0, placement = "") => queryOptions({
  queryKey: ["learning", academyId, "staff-student", recordId, page, placement],
  queryFn: ({ signal }) => loadStaffStudentLearning(academyId, recordId, page * 24, signal), staleTime: 30_000,
});
export const studentAttendanceOptions = (academyId: string, yearId: string, recordId: string) => queryOptions({
  queryKey: ["attendance", academyId, "student", yearId, recordId],
  queryFn: ({ signal }) => loadStudentAttendance(academyId, yearId, recordId, signal), staleTime: 30_000,
});
export const studentAssessmentOptions = (academyId: string, recordId: string, page = 0) => queryOptions({
  queryKey: ["assessments", academyId, "student", recordId, page],
  queryFn: ({ signal }) => loadStudentAssessments(academyId, recordId, page * 24, signal),
  // Returning from marking must revalidate the result, as in the staff assessment list.
  staleTime: 0,
});
export const unitCompleted = (unit: StudentUnit) => unit.progress.total > 0 && unit.progress.completed === unit.progress.total;
export const expiredUnfinishedUnit = (units: StudentUnit[]) => units.find(unit => unit.access.status === "expired" && unit.progress.total > unit.progress.completed);

/** Prioritize only the loaded page. Never imply a complete-history ranking. */
export function learningPreview(units: StudentUnit[]) {
  const rank = (unit: StudentUnit) => unit.access.status === "expired" ? 0 : unit.access.status === "active" ? 1 : 2;
  const unfinished = units.filter(unit => !unitCompleted(unit)).sort((a, b) => rank(a) - rank(b)).slice(0, 2);
  return { unfinished, completed: units.filter(unitCompleted).slice(0, 3 - unfinished.length) };
}
export const awaitingMarking = (items: StudentAssessmentData["items"]) => items.filter(item => !item.complete && (item.work === "submitted" || item.work === "late"));
