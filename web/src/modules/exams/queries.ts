import { z } from "zod";

import { createClient } from "@/lib/supabase/client";
import { toExam, toExamPage, toStudentDetail, toStudentList } from "./mapper";
import type { Exam, ExamAudience, ExamPhase, ExamStudent, ExamSummary, StudentDetail } from "./types";

/** Staff reads in the browser. RLS and the RPCs' membership checks limit everything to the caller's academies. */

// Every key is prefixed by ["exams", academyId] so one invalidation covers an academy's exams.
export const examsRootKey = (academyId: string) => ["exams", academyId] as const;
export const examListQueryKey = (academyId: string, filters: ExamListFilters, page: number) => [...examsRootKey(academyId), "list", filters, page] as const;
export const examQueryKey = (academyId: string, examId: string) => [...examsRootKey(academyId), "detail", examId] as const;
export const examStudentsQueryKey = (academyId: string, examId: string) => [...examsRootKey(academyId), "students", examId] as const;
export const examStudentQueryKey = (academyId: string, examId: string, recordId: string) => [...examsRootKey(academyId), "student", examId, recordId] as const;
export const examYearsQueryKey = (academyId: string) => [...examsRootKey(academyId), "years"] as const;
export const examPreviewQueryKey = (academyId: string, audience: unknown) => [...examsRootKey(academyId), "preview", audience] as const;

export const ALL = "all";
export type ExamListFilters = {
  search: string;
  yearId: string;
  /** `current` hides archived exams (the default). */
  phase: ExamPhase | "current" | typeof ALL;
  audience: ExamAudience | typeof ALL;
};
export const DEFAULT_EXAM_FILTERS: Omit<ExamListFilters, "yearId"> = { search: "", phase: "current", audience: ALL };
export const EXAM_PAGE_SIZE = 25;

export type AcademicYearOption = { id: string; startYear: number; open: boolean };

/** Every academic year of the academy, newest first. */
export async function loadExamYears(academyId: string): Promise<AcademicYearOption[]> {
  const { data, error } = await createClient().from("academic_years").select("id,start_year,closed_at")
    .eq("academy_id", academyId).order("start_year", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((year) => ({ id: year.id, startYear: year.start_year, open: year.closed_at === null }));
}

/** One page of exams, filtered and phased by the database. */
export async function loadExams(academyId: string, filters: ExamListFilters, page: number): Promise<{ total: number; exams: ExamSummary[]; serverNow: string }> {
  const { data, error } = await createClient().rpc("list_exams", {
    p_academy_id: academyId,
    p_academic_year_id: (filters.yearId === ALL ? null : filters.yearId) as string,
    p_search: filters.search.trim(),
    p_phase: (filters.phase === ALL || filters.phase === "current" ? null : filters.phase) as string,
    p_audience: (filters.audience === ALL ? null : filters.audience) as ExamAudience,
    p_include_archived: filters.phase === ALL,
    p_limit: EXAM_PAGE_SIZE,
    p_offset: page * EXAM_PAGE_SIZE,
  });
  if (error) throw new Error(error.message);
  if (data === null) throw new Error("forbidden");
  return toExamPage(data);
}

/** One exam's staff document, or null when it is not in this academy. Settles due deadlines first. */
export async function loadExam(academyId: string, examId: string): Promise<Exam | null> {
  if (!z.guid().safeParse(examId).success) return null;
  const { data, error } = await createClient().rpc("get_exam", { p_academy_id: academyId, p_exam_id: examId });
  if (error) throw new Error(error.message);
  return data === null ? null : toExam(data);
}

/** The eligible roster plus historical participants, with work and result state. */
export async function loadExamStudents(academyId: string, examId: string): Promise<ExamStudent[]> {
  const { data, error } = await createClient().rpc("list_exam_students", { p_academy_id: academyId, p_exam_id: examId });
  if (error) throw new Error(error.message);
  return data === null ? [] : toStudentList(data).students;
}

/** One student's row and per-question detail, or null. */
export async function loadExamStudent(academyId: string, examId: string, recordId: string): Promise<{ student: ExamStudent; detail: StudentDetail } | null> {
  const { data, error } = await createClient().rpc("get_exam_student", { p_academy_id: academyId, p_exam_id: examId, p_record_id: recordId });
  if (error) throw new Error(error.message);
  return data === null ? null : toStudentDetail(data);
}

export type AudienceQuery = { academicYearId: string; audience: ExamAudience; levelId: string | null; trackId: string | null; groupIds: string[] };

/** Advisory count of active students the audience matches now. */
export async function loadExamAudiencePreview(academyId: string, query: AudienceQuery): Promise<number> {
  const { data, error } = await createClient().rpc("preview_exam_audience", {
    p_academy_id: academyId, p_academic_year_id: query.academicYearId, p_audience: query.audience,
    p_level_id: query.levelId as string, p_track_id: query.trackId as string, p_group_ids: query.groupIds,
  });
  if (error) throw new Error(error.message);
  return z.object({ student_count: z.number().int() }).parse(data).student_count;
}
