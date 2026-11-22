import "@tanstack/react-start/server-only";

import { z } from "zod";

import type { StaffApiContext } from "@/lib/api/handler";
import { apiError, apiJson, snakeKeys } from "@/lib/api/http";
import { studentAttendanceHistory } from "@/modules/attendance/server";
import { HISTORY_KINDS, studentAssessmentHistory, type HistoryKind } from "@/modules/assessments/server";
import { getStudentRecord, listStudentRecords, staffContext } from "./data";
import { DEFAULT_LIST_PARAMS, MAX_SEARCH_LENGTH, STATUS_FILTERS, type StatusFilter } from "./list-params";

/**
 * Staff student records for the bearer `/api/v1` contract (snake_case JSON), read-only. Every read runs as the
 * caller (RLS applies) after an active-membership check, and each detail read is bound to the annual record's own
 * academy and year. Documented in docs/api/students.openapi.yaml.
 */

const PAGE_SIZES = [20, 50, 100] as const;

function intParam(value: string | null, fallback: number, min: number, max: number): number | null {
  if (value === null) return fallback;
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
}

const readFail = (context: StaffApiContext, status: 400 | 401 | 403 | 404 | 500) =>
  apiError(context, status === 400 ? "INVALID_REQUEST" : status === 401 || status === 403 ? "FORBIDDEN" : status === 404 ? "NOT_FOUND" : "INTERNAL");

const guid = (value: string) => z.guid().safeParse(value).success;

/** GET /api/v1/academies/{academyId}/students?search=&status=&page=&page_size= — the open year's records by name. */
export async function studentsResponse(context: StaffApiContext, academyId: string, params: URLSearchParams) {
  const search = params.get("search") ?? "";
  const status = params.get("status") ?? "active";
  const page = intParam(params.get("page"), 0, 0, 10000);
  const pageSize = intParam(params.get("page_size"), 50, 1, 100);
  if (!guid(academyId) || page === null || pageSize === null || !(PAGE_SIZES as readonly number[]).includes(pageSize)
    || search.length > MAX_SEARCH_LENGTH || !(STATUS_FILTERS as readonly string[]).includes(status)) {
    return apiError(context, "INVALID_REQUEST");
  }
  const result = await listStudentRecords(academyId, {
    ...DEFAULT_LIST_PARAMS, search, status: status as StatusFilter, pageIndex: page, pageSize: pageSize as 20 | 50 | 100,
  }, context.authority);
  if (!result.ok) return readFail(context, result.status);
  const { academicYearId, rows, total } = result.data;
  let academicYear = null;
  if (academicYearId) {
    const { data } = await context.authority.db.from("academic_years").select("id,start_year").eq("id", academicYearId).maybeSingle();
    academicYear = data && { id: data.id, startYear: data.start_year, closed: false };
  }
  return apiJson(context, snakeKeys({
    academicYear,
    total,
    page,
    pageSize,
    students: rows.map(row => ({
      id: row.id,
      fullName: row.fullName,
      levelName: row.levelName,
      trackName: row.trackName,
      groupName: row.groupName,
      participationType: row.participationType,
      archived: row.archivedAt !== null,
      onlineAccount: row.onlineAccount,
    })),
  }));
}

/** The record's academy-scoped placement row, or null when it is not in this academy (or not visible). */
async function scopedRecord(context: StaffApiContext, academyId: string, recordId: string) {
  const { data, error } = await context.authority.db.from("annual_student_records").select("id,academic_year_id")
    .eq("academy_id", academyId).eq("id", recordId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Shared guard: valid ids, an active staff member, and a record that belongs to the academy. */
async function withRecord(
  context: StaffApiContext, academyId: string, recordId: string, handler: (record: { id: string; academic_year_id: string }) => Promise<Response>,
) {
  if (!guid(academyId) || !guid(recordId)) return apiError(context, "INVALID_REQUEST");
  if (!await staffContext(academyId, context.authority)) return apiError(context, "FORBIDDEN");
  const record = await scopedRecord(context, academyId, recordId);
  return record ? handler(record) : apiError(context, "NOT_FOUND");
}

/** GET /api/v1/academies/{academyId}/students/{recordId} — facts, contacts, resolved placement and access state. */
export async function studentResponse(context: StaffApiContext, academyId: string, recordId: string) {
  if (!guid(academyId) || !guid(recordId)) return apiError(context, "INVALID_REQUEST");
  const result = await getStudentRecord(academyId, recordId, context.authority);
  if (!result.ok) return readFail(context, result.status);
  const record = result.data;
  const { db } = context.authority;
  const [year, level, track, group] = await Promise.all([
    db.from("academic_years").select("id,start_year,closed_at").eq("id", record.academicYearId).maybeSingle(),
    db.from("global_levels").select("name").eq("id", record.levelId).maybeSingle(),
    record.trackId ? db.from("academy_tracks").select("name").eq("academy_id", academyId).eq("id", record.trackId).maybeSingle() : null,
    record.primaryGroupId ? db.from("groups").select("name").eq("academy_id", academyId).eq("id", record.primaryGroupId).maybeSingle() : null,
  ]);
  if (year.error || !year.data || level.error || track?.error || group?.error) return apiError(context, "INTERNAL");
  return apiJson(context, snakeKeys({
    id: record.id,
    fullName: record.fullName,
    studentPhone: record.studentPhone,
    parentPhone: record.parentPhone,
    academicYear: { id: year.data.id, startYear: year.data.start_year, closed: year.data.closed_at !== null },
    levelId: record.levelId,
    levelName: level.data?.name ?? record.levelId,
    trackName: track?.data?.name ?? null,
    groupName: group?.data?.name ?? null,
    participationType: record.participationType,
    archived: record.archivedAt !== null,
    archivedAt: record.archivedAt,
    onlineAccount: record.onlineAccount,
    manuallySuspended: record.manuallySuspended,
  }));
}

/** GET /api/v1/academies/{academyId}/students/{recordId}/attendance?limit=&offset= */
export async function studentAttendanceResponse(context: StaffApiContext, academyId: string, recordId: string, params: URLSearchParams) {
  const limit = intParam(params.get("limit"), 50, 1, 100);
  const offset = intParam(params.get("offset"), 0, 0, 100000);
  if (limit === null || offset === null) return apiError(context, "INVALID_REQUEST");
  return withRecord(context, academyId, recordId, async (record) => {
    const history = await studentAttendanceHistory(context.authority.db, { academyId, academicYearId: record.academic_year_id, recordId }, limit, offset);
    return apiJson(context, snakeKeys({ academicYearId: record.academic_year_id, ...history, limit, offset }));
  });
}

/** GET /api/v1/academies/{academyId}/students/{recordId}/assessments?kind=&limit=&offset= */
export async function studentAssessmentsResponse(context: StaffApiContext, academyId: string, recordId: string, params: URLSearchParams) {
  const kind = params.get("kind");
  const limit = intParam(params.get("limit"), 25, 1, 100);
  const offset = intParam(params.get("offset"), 0, 0, 100000);
  if (limit === null || offset === null || (kind !== null && !(HISTORY_KINDS as readonly string[]).includes(kind))) return apiError(context, "INVALID_REQUEST");
  return withRecord(context, academyId, recordId, async (record) => {
    const result = await studentAssessmentHistory(context.authority.db, academyId, recordId, kind as HistoryKind | null, limit, offset);
    if (!result.ok) {
      return apiError(context, result.code === "forbidden" ? "FORBIDDEN" : result.code === "not_found" ? "NOT_FOUND" : result.code === "validation" ? "INVALID_REQUEST" : "INTERNAL");
    }
    return apiJson(context, snakeKeys({ academicYearId: record.academic_year_id, kind, ...result.data, limit, offset }));
  });
}
