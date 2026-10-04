import { writeListParams, type StudentListParams } from "./list-params";
import type { StudentListResult, StudentRecord } from "./types";

// Every key is prefixed by ["students", academyId] so one invalidation covers an academy's student data.
export const studentsRootKey = (academyId: string) => ["students", academyId] as const;
export const studentListQueryKey = (academyId: string, params: StudentListParams) =>
  [...studentsRootKey(academyId), "list", params] as const;
export const studentRecordQueryKey = (academyId: string, recordId: string) =>
  [...studentsRootKey(academyId), "detail", recordId] as const;

export class StudentRequestError extends Error {
  constructor(readonly status: number) {
    super(`Student request failed with status ${status}`);
  }
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: "no-store", headers: { Accept: "application/json" } });
  if (!response.ok) throw new StudentRequestError(response.status);
  return response.json() as Promise<T>;
}

/** One page of records from the authenticated list endpoint. */
export function fetchStudentList(academyId: string, params: StudentListParams, signal?: AbortSignal) {
  return getJson<StudentListResult>(`/api/students?${writeListParams(params, { academy: academyId })}`, signal);
}

/** One record, fetched fresh before the edit sheet enables editing. */
export function fetchStudentRecord(academyId: string, recordId: string, signal?: AbortSignal) {
  const query = new URLSearchParams({ academy: academyId });
  return getJson<StudentRecord>(`/api/students/${encodeURIComponent(recordId)}?${query}`, signal);
}
