import "server-only";

import { z } from "zod";

import { cookieAuthority, type Db } from "@/lib/supabase/authority";
import { studentFailure, studentFailureFromDatabase } from "./errors";
import { toStudentExamOverview, toStudentExamPage, toStudentExamStart } from "./mapper";
import {
  STUDENT_EXAM_PAGE_SIZE, type StudentExamOverview, type StudentExamPage, type StudentExamRead, type StudentExamStartResult,
} from "./types";

/**
 * Student exam operations for the cookie web boundary. Each call runs as the signed-in account; the
 * database resolves the connected annual record of the academy's open year and re-checks academy,
 * year, suspension, audience, window and standalone access. The academy id only locates the exam.
 * Responses are per-account and never shared-cached.
 */

type DatabaseError = { code?: string; message?: string; details?: string };

async function call<T>(
  run: (db: Db) => PromiseLike<{ data: unknown; error: DatabaseError | null }>, parse: (value: unknown) => T,
): Promise<StudentExamRead<T>> {
  const caller = await cookieAuthority();
  if (!caller) return studentFailure("forbidden");
  try {
    const { data, error } = await run(caller.db);
    if (error) return studentFailureFromDatabase(error);
    return { ok: true, data: parse(data) };
  } catch {
    return studentFailure("unavailable");
  }
}

const listInput = z.object({ academyId: z.uuid(), page: z.number().int().min(1).max(10_000) });

/** One page of the caller's discoverable exams in the academy: resumable and open first, then upcoming, then history. */
export async function listMyExams(input: { academyId: string; page: number }): Promise<StudentExamRead<StudentExamPage>> {
  const parsed = listInput.safeParse(input);
  if (!parsed.success) return studentFailure("validation");
  const { academyId, page } = parsed.data;
  return call((db) => db.rpc("list_my_exams", {
    p_academy_id: academyId, p_limit: STUDENT_EXAM_PAGE_SIZE, p_offset: (page - 1) * STUDENT_EXAM_PAGE_SIZE,
  }), toStudentExamPage);
}

const examInput = z.object({ academyId: z.uuid(), examId: z.uuid() });

/**
 * The caller's overview of one exam of the academy. It may settle due work through the existing
 * settlement path; it never starts an attempt or moves a deadline. Undiscoverable, wrong-academy and
 * unknown exams are not_found.
 */
export async function getMyExamOverview(input: { academyId: string; examId: string }): Promise<StudentExamRead<StudentExamOverview>> {
  const parsed = examInput.safeParse(input);
  if (!parsed.success) return studentFailure("not_found");
  const { academyId, examId } = parsed.data;
  return call((db) => db.rpc("get_my_exam_overview", { p_academy_id: academyId, p_exam_id: examId }), toStudentExamOverview);
}

/**
 * Starts the caller's single attempt or resumes it. Repeats and concurrent calls return the same
 * attempt with its original start, deadline and departure count; the database checks academy
 * ownership, standalone access, live eligibility and the window in one transaction.
 */
export async function startMyExam(input: { academyId: string; examId: string }): Promise<StudentExamStartResult> {
  const parsed = examInput.safeParse(input);
  if (!parsed.success) return studentFailure("validation");
  const { academyId, examId } = parsed.data;
  const result = await call((db) => db.rpc("start_my_exam", { p_academy_id: academyId, p_exam_id: examId }), toStudentExamStart);
  return result.ok ? { ok: true, ...result.data } : result;
}
