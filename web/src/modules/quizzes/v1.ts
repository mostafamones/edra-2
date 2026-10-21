import "server-only";

import { z } from "zod";

import type { StaffApiContext } from "@/lib/api/handler";
import { apiError, apiJson, snakeKeys } from "@/lib/api/http";
import { getQuiz, listQuizzes, listStudents, quizAcademy } from "./data";
import { QUIZ_AUDIENCES, QUIZ_PHASES } from "./types";

/**
 * The quizzes part of the external `/api/v1` contract (snake_case JSON): staff reads only. Staff
 * commands use the web actions; student operations are not exposed until authoritative student
 * account links and released content exist. Documented in docs/api/quizzes.openapi.yaml.
 */

const readFail = (context: StaffApiContext, status: 400 | 403 | 404 | 500) =>
  apiError(context, status === 400 ? "INVALID_REQUEST" : status === 403 ? "FORBIDDEN" : status === 404 ? "NOT_FOUND" : "INTERNAL");

function intParam(value: string | null, fallback: number, min: number, max: number): number | null {
  if (value === null) return fallback;
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
}

/** GET /api/v1/academies/{academyId}/quizzes?academic_year_id=&phase=&audience=&search=&limit=&offset= */
export async function quizzesResponse(context: StaffApiContext, academyId: string, params: URLSearchParams) {
  const year = params.get("academic_year_id");
  const phase = params.get("phase");
  const audience = params.get("audience");
  const search = params.get("search") ?? "";
  const limit = intParam(params.get("limit"), 25, 1, 100);
  const offset = intParam(params.get("offset"), 0, 0, 100000);
  if (!z.guid().safeParse(academyId).success || limit === null || offset === null || search.length > 200
    || (year !== null && !z.guid().safeParse(year).success)
    || (phase !== null && !(QUIZ_PHASES as readonly string[]).includes(phase))
    || (audience !== null && !(QUIZ_AUDIENCES as readonly string[]).includes(audience))) {
    return apiError(context, "INVALID_REQUEST");
  }
  const result = await listQuizzes({
    academyId, academicYearId: year, search, phase: phase as (typeof QUIZ_PHASES)[number] | null,
    audience: audience as (typeof QUIZ_AUDIENCES)[number] | null, includeArchived: false, limit, offset,
  }, context.authority);
  if (!result.ok) return readFail(context, result.status);
  return apiJson(context, snakeKeys(result.data));
}

/** Resolves a quiz's academy for token clients. Unknown and foreign quizzes are both 404. */
export async function withQuizAcademy(context: StaffApiContext, quizId: string, handler: (academyId: string) => Promise<Response>) {
  const academyId = await quizAcademy(quizId, context.authority);
  return academyId ? handler(academyId) : apiError(context, "NOT_FOUND");
}

/** GET /api/v1/quizzes/{quizId} — the staff document, including the key (staff only). */
export async function quizResponse(context: StaffApiContext, academyId: string, quizId: string) {
  const result = await getQuiz(academyId, quizId, context.authority);
  if (!result.ok) return readFail(context, result.status);
  return apiJson(context, snakeKeys(result.data));
}

/** GET /api/v1/quizzes/{quizId}/students — eligible roster and historical participants with work and result state. */
export async function quizStudentsResponse(context: StaffApiContext, academyId: string, quizId: string) {
  const result = await listStudents(academyId, quizId, context.authority);
  if (!result.ok) return readFail(context, result.status);
  return apiJson(context, {
    total: result.data.total,
    students: result.data.students.map(({ recordId, ...student }) => snakeKeys({ annualStudentRecordId: recordId, ...student })),
  });
}
