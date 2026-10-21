import "server-only";

import { z } from "zod";

import type { StaffApiContext } from "@/lib/api/handler";
import { apiError, apiJson, snakeKeys } from "@/lib/api/http";
import { getExam, listExams, listStudents, examAcademy } from "./data";
import { EXAM_AUDIENCES, EXAM_PHASES } from "./types";

/**
 * The exams part of the external `/api/v1` contract (snake_case JSON): staff reads only. Staff
 * commands use the web actions; student operations are not exposed until authoritative student
 * account links and released content exist. Documented in docs/api/exams.openapi.yaml.
 */

const readFail = (context: StaffApiContext, status: 400 | 403 | 404 | 500) =>
  apiError(context, status === 400 ? "INVALID_REQUEST" : status === 403 ? "FORBIDDEN" : status === 404 ? "NOT_FOUND" : "INTERNAL");

function intParam(value: string | null, fallback: number, min: number, max: number): number | null {
  if (value === null) return fallback;
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
}

/** GET /api/v1/academies/{academyId}/exams?academic_year_id=&phase=&audience=&search=&limit=&offset= */
export async function examsResponse(context: StaffApiContext, academyId: string, params: URLSearchParams) {
  const year = params.get("academic_year_id");
  const phase = params.get("phase");
  const audience = params.get("audience");
  const search = params.get("search") ?? "";
  const limit = intParam(params.get("limit"), 25, 1, 100);
  const offset = intParam(params.get("offset"), 0, 0, 100000);
  if (!z.guid().safeParse(academyId).success || limit === null || offset === null || search.length > 200
    || (year !== null && !z.guid().safeParse(year).success)
    || (phase !== null && !(EXAM_PHASES as readonly string[]).includes(phase))
    || (audience !== null && !(EXAM_AUDIENCES as readonly string[]).includes(audience))) {
    return apiError(context, "INVALID_REQUEST");
  }
  const result = await listExams({
    academyId, academicYearId: year, search, phase: phase as (typeof EXAM_PHASES)[number] | null,
    audience: audience as (typeof EXAM_AUDIENCES)[number] | null, includeArchived: false, limit, offset,
  }, context.authority);
  if (!result.ok) return readFail(context, result.status);
  return apiJson(context, snakeKeys(result.data));
}

/** Resolves an exam's academy for token clients. Unknown and foreign exams are both 404. */
export async function withExamAcademy(context: StaffApiContext, examId: string, handler: (academyId: string) => Promise<Response>) {
  const academyId = await examAcademy(examId, context.authority);
  return academyId ? handler(academyId) : apiError(context, "NOT_FOUND");
}

/** GET /api/v1/exams/{examId} — the staff document, including the key (staff only). */
export async function examResponse(context: StaffApiContext, academyId: string, examId: string) {
  const result = await getExam(academyId, examId, context.authority);
  if (!result.ok) return readFail(context, result.status);
  return apiJson(context, snakeKeys(result.data));
}

/** GET /api/v1/exams/{examId}/students — eligible roster and historical participants with work and result state. */
export async function examStudentsResponse(context: StaffApiContext, academyId: string, examId: string) {
  const result = await listStudents(academyId, examId, context.authority);
  if (!result.ok) return readFail(context, result.status);
  return apiJson(context, {
    total: result.data.total,
    students: result.data.students.map(({ recordId, ...student }) => snakeKeys({ annualStudentRecordId: recordId, ...student })),
  });
}
