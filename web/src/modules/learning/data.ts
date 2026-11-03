import "@tanstack/react-start/server-only";

import { listMyAssignments } from "@/modules/assignments/server";
import { readLearningList } from "@/modules/content/server";
import { listMyExams, STUDENT_EXAM_PAGE_SIZE } from "@/modules/exams/server";
import { listMyStudentAcademies, type StudentAcademyLink } from "@/modules/students/server";
import type { Scope } from "./params";

export type { Scope } from "./params";

/** One academy's page of a list; `items` is null when that academy could not be read. */
export type AcademyItems<T> = { academy: StudentAcademyLink; items: T[] | null; hasMore: boolean };

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
/** The read time, taken with the data so every card on a page counts down from one clock. */
export async function readNow() {
  return Date.now();
}
