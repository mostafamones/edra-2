"use server";
import { z } from "zod";
import { cookieAuthority } from "@/lib/supabase/authority";
import { academyMember } from "@/lib/supabase/membership";
import { validAcademySlug } from "@/lib/routing";
import { listStudentRecords, readListParams, getMyStudentAcademy } from "@/modules/students/server";
import { readLearningList, searchStaffContent } from "@/modules/content/server";
import { listMyAssignments, searchStaffAssignments } from "@/modules/assignments/server";
import { listQuizzes } from "@/modules/quizzes/server";
import { listExams } from "@/modules/exams/server";
import type { SearchRecord } from "@/lib/search";
import type { SearchGroup, SearchOutcome } from "./types";

const inputSchema = z.object({ platform: z.enum(["staff", "student"]), slug: z.string().refine(validAcademySlug), query: z.string().trim().min(2).max(100) });
export async function searchAcademy(value: unknown): Promise<SearchOutcome> {
  try {
    const { platform, slug, query } = inputSchema.parse(value);
    const caller = await cookieAuthority();
    if (!caller) return { ok: false, message: "Sign in to search." };
    const groups: SearchGroup[] = [], unavailable: string[] = [];
    async function collect(label: string, run: () => Promise<SearchRecord[]>) {
      try { groups.push({ label, records: await run() }); }
      catch { unavailable.push(label); }
    }
    if (platform === "student") {
      const academy = await getMyStudentAcademy(slug);
      if (!academy) return { ok: false, message: "This academy is unavailable." };
      await Promise.all([
        collect("Content units", async () => {
          const result = await readLearningList({ academyId: academy.academy.id, search: query });
          return result.page.units.slice(0, 6).map(unit => ({ id: unit.id, title: unit.title, detail: unit.access.status, path: `units/${unit.id}` }));
        }),
        collect("Assignments", async () => {
          const result = await listMyAssignments({ academyId: academy.academy.id, page: 1, search: query });
          if (!result.ok) throw new Error("unavailable");
          return result.data.items.slice(0, 6).map(item => ({ id: item.id, title: item.title,
            detail: item.unit?.title ?? "Standalone", path: `assignments/${item.id}` }));
        }),
      ]);
      return { ok: true, value: { userId: caller.userId, academyId: academy.academy.id, scope: academy.academy.name, groups, unavailable } };
    }
    const academy = await caller.db.from("academies").select("id,name").eq("slug", slug).maybeSingle();
    if (academy.error || !academy.data || !await academyMember(academy.data.id, caller)) return { ok: false, message: "You no longer have access to this academy." };
    const academyId = academy.data.id;
    const year = await caller.db.from("academic_years").select("id,start_year").eq("academy_id", academyId).is("closed_at", null).maybeSingle();
    if (year.error) return { ok: false, message: "Could not load the academic year." };
    if (year.data) {
      const yearId = year.data.id;
      await Promise.all([
        collect("Students", async () => {
          const params = readListParams(new URLSearchParams({ q: query })).params;
          const result = await listStudentRecords(academyId, params);
          if (!result.ok) throw new Error("unavailable");
          return result.data.rows.slice(0, 6).map(row => ({ id: row.id, title: row.fullName,
            detail: [row.levelName, row.trackName, row.groupName].filter(Boolean).join(" · "),
            path: `students?record=${row.id}` }));
        }),
        collect("Content units", () => searchStaffContent(academyId, yearId, query)),
        collect("Assignments", () => searchStaffAssignments(academyId, yearId, query)),
        collect("Quizzes", async () => {
          const result = await listQuizzes({ academyId, academicYearId: yearId, search: query, limit: 6 }, caller);
          if (!result.ok) throw new Error("unavailable");
          return result.data.quizzes.map(item => ({ id: item.id, title: item.title, detail: item.phase, path: `quizzes/${item.id}` }));
        }),
        collect("Exams", async () => {
          const result = await listExams({ academyId, academicYearId: yearId, search: query, limit: 6 }, caller);
          if (!result.ok) throw new Error("unavailable");
          return result.data.exams.map(item => ({ id: item.id, title: item.title, detail: item.phase, path: `exams/${item.id}` }));
        }),
      ]);
    }
    const order = ["Students", "Content units", "Assignments", "Quizzes", "Exams"];
    groups.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
    return { ok: true, value: { userId: caller.userId, academyId, scope: `${academy.data.name}${year.data ? ` · ${year.data.start_year}–${year.data.start_year + 1}` : ""}`, groups, unavailable } };
  } catch { return { ok: false, message: "Search is unavailable. Please retry." }; }
}
