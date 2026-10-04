import { PAGE_SIZES, type PageSize } from "../list-params";
import { IMPORT_OUTCOMES, IMPORT_STATUSES, type ImportRowFilter } from "./types";

export type ImportRowParams = {
  status: ImportRowFilter | "entries" | null;
  search: string;
  pageIndex: number;
  pageSize: PageSize;
};

export const DEFAULT_ROW_PARAMS: ImportRowParams = { status: null, search: "", pageIndex: 0, pageSize: 20 };

const FILTERS: readonly string[] = [...IMPORT_STATUSES, ...IMPORT_OUTCOMES, "entries"];
export const isRowFilter = (value: unknown): value is NonNullable<ImportRowParams["status"]> => FILTERS.includes(value as string);

/** Reads row-list parameters from a query string; null when any value is invalid. */
export function readRowParams(query: URLSearchParams): ImportRowParams | null {
  const status = query.get("status");
  const search = query.get("q") ?? "";
  const page = query.get("page") ?? "1";
  const size = Number(query.get("size") ?? DEFAULT_ROW_PARAMS.pageSize);
  if ((status !== null && !isRowFilter(status)) || search.length > 100 || !/^[1-9]\d{0,5}$/.test(page)
    || !(PAGE_SIZES as readonly number[]).includes(size)) return null;
  return { status, search, pageIndex: Number(page) - 1, pageSize: size as PageSize };
}

export function writeRowParams(params: ImportRowParams, extra: Record<string, string>) {
  const query = new URLSearchParams(extra);
  if (params.status) query.set("status", params.status);
  if (params.search.trim()) query.set("q", params.search.trim());
  if (params.pageIndex > 0) query.set("page", String(params.pageIndex + 1));
  if (params.pageSize !== DEFAULT_ROW_PARAMS.pageSize) query.set("size", String(params.pageSize));
  return query;
}
