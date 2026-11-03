import "@tanstack/react-start/server-only";

import { studentAssignmentStatus } from "@/modules/assignments/student/components/status";
import { listMyStudentAcademies } from "@/modules/students/server";
import { readMyAssignments, readMyExams, readMyUnits, readNow, type AcademyItems, type Scope } from "./data";
import { unitStarted, type UnitStatus } from "./started";

const LIMIT = 5;

function flatten<T>(groups: AcademyItems<T>[]) {
  return groups.flatMap(({ academy, items }) => (items ?? []).map((item) => ({ item, academy: { name: academy.name, slug: academy.slug } })));
}

/** Home across all academies. Filtering and the five-row cut happen here so only rendered fields reach the browser. */
export async function loadLearningHome() {
  const [units, assignments, exams] = await Promise.all([readMyUnits(undefined), readMyAssignments(undefined), readMyExams(undefined)]);
  const resume = flatten(units).filter(({ item }) => unitStarted(item) && item.progress!.completed < item.progress!.total).slice(0, LIMIT)
    .map(({ item, academy }) => ({ id: item.id, title: item.title, academy, completed: item.progress!.completed, total: item.progress!.total }));
  const due = flatten(assignments).filter(({ item }) => !item.receipt && !item.result && !item.blockedReason)
    // Dated work first, soonest due on top.
    .sort((a, b) => (a.item.dueAt ?? "~").localeCompare(b.item.dueAt ?? "~")).slice(0, LIMIT)
    .map(({ item, academy }) => ({ id: item.id, title: item.title, academy, dueAt: item.dueAt, status: studentAssignmentStatus(item) }));
  const upcoming = flatten(exams).filter(({ item }) => ["start", "resume", "not_yet_open"].includes(item.action)).slice(0, LIMIT)
    .map(({ item, academy }) => ({ examId: item.examId, title: item.title, academy, action: item.action, opensAt: item.action === "not_yet_open" ? item.opensAt : null }));
  return { resume, due, upcoming };
}
export type LearningHomeData = Awaited<ReturnType<typeof loadLearningHome>>;

export async function loadLearningUnits(args: { started: boolean; search: string; scope?: Scope; view?: "grid" | "list"; statuses?: UnitStatus[]; group?: "none" | "academy" | "status" }) {
  const [groups, now, academies] = await Promise.all([readMyUnits(args.scope), readNow(), listMyStudentAcademies()]);
  return { ...args, groups, now, academies };
}
export type LearningUnitsData = Awaited<ReturnType<typeof loadLearningUnits>>;

export async function loadLearningAssignments(args: { scope?: Scope; unit?: string }) {
  const unitId = args.scope && args.unit ? args.unit : undefined;
  const [groups, academies] = await Promise.all([readMyAssignments(args.scope, unitId), listMyStudentAcademies()]);
  const course = unitId ? groups.flatMap((group) => group.items ?? []).find((item) => item.unit?.id === unitId)?.unit?.title : undefined;
  return {
    ...args, academies, course,
    groups: groups.map((group) => ({ ...group, items: group.items?.map((item) => ({
      id: item.id, title: item.title, dueAt: item.dueAt, required: item.required, unitTitle: unitId ? null : item.unit?.title ?? null, status: studentAssignmentStatus(item),
    })) ?? null })),
  };
}
export type LearningAssignmentsData = Awaited<ReturnType<typeof loadLearningAssignments>>;

export async function loadLearningExams(args: { scope?: Scope }) {
  const [groups, academies] = await Promise.all([readMyExams(args.scope), listMyStudentAcademies()]);
  return {
    ...args, academies,
    groups: groups.map((group) => ({ ...group, items: group.items?.map((exam) => ({
      examId: exam.examId, title: exam.title, action: exam.action, timeLimitMinutes: exam.timeLimitMinutes,
      opensAt: exam.action === "not_yet_open" ? exam.opensAt : null, closesAt: ["start", "resume"].includes(exam.action) ? exam.closesAt : null,
    })) ?? null })),
  };
}
export type LearningExamsData = Awaited<ReturnType<typeof loadLearningExams>>;
