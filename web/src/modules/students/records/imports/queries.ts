import { StudentRequestError, studentsRootKey } from "../queries";
import { writeRowParams, type ImportRowParams } from "./params";
import type { ImportLog, ImportRowsPage, ImportSession, ImportSummary } from "./types";

// Under the students root key, so invalidating an academy's student data refreshes imports too.
export const importsRootKey = (academyId: string) => [...studentsRootKey(academyId), "imports"] as const;
export const unfinishedImportQueryKey = (academyId: string) => [...importsRootKey(academyId), "unfinished"] as const;
export const importSessionKey = (academyId: string, sessionId: string) => [...importsRootKey(academyId), sessionId] as const;
export const importSummaryQueryKey = (academyId: string, sessionId: string) => [...importSessionKey(academyId, sessionId), "summary"] as const;
export const importRowsQueryKey = (academyId: string, sessionId: string, params: ImportRowParams) =>
  [...importSessionKey(academyId, sessionId), "rows", params] as const;

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: "no-store", headers: { Accept: "application/json" } });
  if (!response.ok) throw new StudentRequestError(response.status);
  return response.json() as Promise<T>;
}

const base = (sessionId: string) => `/api/students/imports/${encodeURIComponent(sessionId)}`;

export function fetchUnfinishedImport(academyId: string, signal?: AbortSignal) {
  return getJson<{ session: ImportSession | null }>(`/api/students/imports?${new URLSearchParams({ academy: academyId })}`, signal);
}

export function fetchImportSummary(academyId: string, sessionId: string, signal?: AbortSignal) {
  return getJson<ImportSummary>(`${base(sessionId)}?${new URLSearchParams({ academy: academyId })}`, signal);
}

export function fetchImportRows(academyId: string, sessionId: string, params: ImportRowParams, signal?: AbortSignal) {
  return getJson<ImportRowsPage>(`${base(sessionId)}/rows?${writeRowParams(params, { academy: academyId })}`, signal);
}


export const importLogsQueryKey = (academyId: string, page: number) => [...importsRootKey(academyId), "logs", page] as const;
export const fetchImportLogs = (academyId: string, page: number, signal?: AbortSignal) =>
  getJson<{ logs: ImportLog[]; total: number }>(`/api/students/imports/logs?${new URLSearchParams({ academy: academyId, page: String(page + 1) })}`, signal);
