import type { PreviewStudentTarget } from "./types";

export function studentShortcuts(students: PreviewStudentTarget[], currentId: string | null) {
  const current = students.find(student => student.logicalId === currentId);
  const online = students.find(student => student.participationType === "online_only");
  const choices = [current,online,...students].filter((student): student is PreviewStudentTarget => Boolean(student));
  return [...new Map(choices.map(student => [student.logicalId,student])).values()].slice(0,2);
}
