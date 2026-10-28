import { listMyAssignments } from "@/modules/assignments/server";
import { readLearningList } from "@/modules/content/server";
import { listMyExams, STUDENT_EXAM_PAGE_SIZE } from "@/modules/exams/server";
import { listMyStudentAcademies, type StudentAcademyLink } from "@/modules/students/server";
import { UNIT_STATUSES, type UnitStatus } from "./started";

/** One academy's page of a list; `items` is null when that academy could not be read. */
export type AcademyItems<T> = { academy: StudentAcademyLink; items: T[] | null; hasMore: boolean };

/** Absent for all academies; one academy's slug and a 1-based page when scoped. */
export type Scope = { slug: string; page: number } | undefined;

// shortcut: unscoped reads take the first page per academy only; add a cross-academy RPC when students outgrow it.
async function perAcademy<T>(scope: Scope, read: (academyId: string, page: number) => Promise<{ items: T[]; hasMore: boolean } | null>, only = scope?.slug): Promise<AcademyItems<T>[]> {
  const academies = (await listMyStudentAcademies()).filter((academy) => !only || academy.slug === only);
  return Promise.all(academies.map(async (academy) => {
    // A suspended or pending academy refuses the read; the others still show.
    const page = await read(academy.id, scope?.page ?? 1).catch(() => null);
    return { academy, items: page?.items ?? null, hasMore: page?.hasMore ?? false };
  }));
}

export function readMyUnits(scope: Scope, search = "") {
  return perAcademy(scope, async (academyId, page) => {
    const result = await readLearningList({ academyId, search, page: page - 1 });
    return { items: result.page.units, hasMore: result.page.hasMore };
  });
}

export function readMyAssignments(scope: Scope, unitId?: string) {
  return perAcademy(scope, async (academyId, page) => {
    const result = await listMyAssignments({ academyId, page, search: "", unitId });
    return result.ok ? { items: result.data.items, hasMore: result.data.hasMore } : null;
  });
}

export function readMyExams(scope: Scope) {
  return perAcademy(scope, async (academyId, page) => {
    const result = await listMyExams({ academyId, page });
    return result.ok ? { items: result.data.items, hasMore: result.data.total > page * STUDENT_EXAM_PAGE_SIZE } : null;
  });
}

/** `?page=` as a page number; anything else is the first page. */
export function pageParam(value: string | string[] | undefined) {
  return typeof value === "string" && /^[1-9]\d{0,3}$/.test(value) ? Number(value) : 1;
}

/** `?academy=` narrows a list page to one academy, which then pages with `?page=`. */
export function scopeParam({ academy, page }: Record<string, string | string[] | undefined>): Scope {
  return typeof academy === "string" && academy ? { slug: academy, page: pageParam(page) } : undefined;
}

/** The read time, taken with the data so every card on a page counts down from one clock. */
export async function readNow() {
  return Date.now();
}

/** Course list settings from the query: search, layout, and which statuses show. */
export function unitListParams({ q, view, finished, status, group }: Record<string, string | string[] | undefined>) {
  const selected = typeof status === "string" ? status.split(",").filter((value): value is UnitStatus => UNIT_STATUSES.includes(value as UnitStatus)) : finished === "1" ? [...UNIT_STATUSES] : ["active" as const];
  const grouping: "none" | "academy" | "status" = group === "academy" || group === "status" ? group : "none";
  return {
    search: typeof q === "string" ? q.trim().slice(0, 100) : "",
    view: view === "list" ? "list" as const : "grid" as const,
    statuses: selected,
    group: grouping,
  };
}
