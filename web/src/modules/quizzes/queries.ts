import { z } from "zod";

import { createClient } from "@/lib/supabase/client";
import { toQuiz, toQuizPage, toStudentDetail, toStudentList } from "./mapper";
import type { Quiz, QuizAudience, QuizPhase, QuizStudent, QuizSummary, StudentDetail } from "./types";

/** Staff reads in the browser. RLS and the RPCs' membership checks limit everything to the caller's academies. */

// Every key is prefixed by ["quizzes", academyId] so one invalidation covers an academy's quizzes.
export const quizzesRootKey = (academyId: string) => ["quizzes", academyId] as const;
export const quizListQueryKey = (academyId: string, filters: QuizListFilters, page: number) => [...quizzesRootKey(academyId), "list", filters, page] as const;
export const quizQueryKey = (academyId: string, quizId: string) => [...quizzesRootKey(academyId), "detail", quizId] as const;
export const quizStudentsQueryKey = (academyId: string, quizId: string) => [...quizzesRootKey(academyId), "students", quizId] as const;
export const quizStudentQueryKey = (academyId: string, quizId: string, recordId: string) => [...quizzesRootKey(academyId), "student", quizId, recordId] as const;
export const quizYearsQueryKey = (academyId: string) => [...quizzesRootKey(academyId), "years"] as const;
export const quizPreviewQueryKey = (academyId: string, audience: unknown) => [...quizzesRootKey(academyId), "preview", audience] as const;

export const ALL = "all";
export type QuizListFilters = {
  search: string;
  yearId: string;
  /** `current` hides archived quizzes (the default). */
  phase: QuizPhase | "current" | typeof ALL;
  audience: QuizAudience | typeof ALL;
};
export const DEFAULT_QUIZ_FILTERS: Omit<QuizListFilters, "yearId"> = { search: "", phase: "current", audience: ALL };
export const QUIZ_PAGE_SIZE = 25;

export type AcademicYearOption = { id: string; startYear: number; open: boolean };

/** Every academic year of the academy, newest first. */
export async function loadQuizYears(academyId: string): Promise<AcademicYearOption[]> {
  const { data, error } = await createClient().from("academic_years").select("id,start_year,closed_at")
    .eq("academy_id", academyId).order("start_year", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((year) => ({ id: year.id, startYear: year.start_year, open: year.closed_at === null }));
}

/** One page of quizzes, filtered and phased by the database. */
export async function loadQuizzes(academyId: string, filters: QuizListFilters, page: number): Promise<{ total: number; quizzes: QuizSummary[]; serverNow: string }> {
  const { data, error } = await createClient().rpc("list_quizzes", {
    p_academy_id: academyId,
    p_academic_year_id: (filters.yearId === ALL ? null : filters.yearId) as string,
    p_search: filters.search.trim(),
    p_phase: (filters.phase === ALL || filters.phase === "current" ? null : filters.phase) as string,
    p_audience: (filters.audience === ALL ? null : filters.audience) as QuizAudience,
    p_include_archived: filters.phase === ALL,
    p_limit: QUIZ_PAGE_SIZE,
    p_offset: page * QUIZ_PAGE_SIZE,
  });
  if (error) throw new Error(error.message);
  if (data === null) throw new Error("forbidden");
  return toQuizPage(data);
}

/** One quiz's staff document, or null when it is not in this academy. Settles due deadlines first. */
export async function loadQuiz(academyId: string, quizId: string): Promise<Quiz | null> {
  if (!z.guid().safeParse(quizId).success) return null;
  const { data, error } = await createClient().rpc("get_quiz", { p_academy_id: academyId, p_quiz_id: quizId });
  if (error) throw new Error(error.message);
  return data === null ? null : toQuiz(data);
}

/** The eligible roster plus historical participants, with work and result state. */
export async function loadQuizStudents(academyId: string, quizId: string): Promise<QuizStudent[]> {
  const { data, error } = await createClient().rpc("list_quiz_students", { p_academy_id: academyId, p_quiz_id: quizId });
  if (error) throw new Error(error.message);
  return data === null ? [] : toStudentList(data).students;
}

/** One student's row and per-question detail, or null. */
export async function loadQuizStudent(academyId: string, quizId: string, recordId: string): Promise<{ student: QuizStudent; detail: StudentDetail } | null> {
  const { data, error } = await createClient().rpc("get_quiz_student", { p_academy_id: academyId, p_quiz_id: quizId, p_record_id: recordId });
  if (error) throw new Error(error.message);
  return data === null ? null : toStudentDetail(data);
}

export type AudienceQuery = { academicYearId: string; audience: QuizAudience; levelId: string | null; trackId: string | null; groupIds: string[] };

/** Advisory count of active students the audience matches now. */
export async function loadQuizAudiencePreview(academyId: string, query: AudienceQuery): Promise<number> {
  const { data, error } = await createClient().rpc("preview_quiz_audience", {
    p_academy_id: academyId, p_academic_year_id: query.academicYearId, p_audience: query.audience,
    p_level_id: query.levelId as string, p_track_id: query.trackId as string, p_group_ids: query.groupIds,
  });
  if (error) throw new Error(error.message);
  return z.object({ student_count: z.number().int() }).parse(data).student_count;
}
