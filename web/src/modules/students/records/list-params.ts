import { z } from "zod";

import { isParticipationType, type ParticipationType } from "./validation";

/** Data columns the database can sort by; the ids double as table column ids. */
export const SORT_FIELDS = [
  "name", "studentPhone", "parentPhone", "level", "track", "group", "participationType", "status", "createdAt",
] as const;
export type SortField = (typeof SORT_FIELDS)[number];
export type SortDescriptor = { id: SortField; desc: boolean };

export const PAGE_SIZES = [10, 20, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 20;
export const MAX_SORTS = 3;
export const MAX_SEARCH_LENGTH = 100;

export const STATUS_FILTERS = ["active", "archived", "all"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

/** "none" selects records without a track or group. */
export const NONE = "none";

export type StudentListParams = {
  search: string;
  status: StatusFilter;
  levelId: string | null;
  track: string | null;
  group: string | null;
  participationType: ParticipationType | null;
  sorts: SortDescriptor[];
  pageIndex: number;
  pageSize: PageSize;
};

export const DEFAULT_SORTS: SortDescriptor[] = [{ id: "name", desc: false }];

export const DEFAULT_LIST_PARAMS: StudentListParams = {
  search: "",
  status: "active",
  levelId: null,
  track: null,
  group: null,
  participationType: null,
  sorts: DEFAULT_SORTS,
  pageIndex: 0,
  pageSize: DEFAULT_PAGE_SIZE,
};

const KEYS = { search: "q", status: "status", level: "level", track: "track", group: "group", type: "type", sort: "sort", page: "page", size: "size" } as const;

const isSortField = (value: string): value is SortField => (SORT_FIELDS as readonly string[]).includes(value);
const isPageSize = (value: number): value is PageSize => (PAGE_SIZES as readonly number[]).includes(value);
const idOrNone = z.union([z.uuid(), z.literal(NONE)]);
const levelId = z.string().regex(/^[a-z0-9-]{1,40}$/);

/** "name.asc,level.desc" ↔ sort descriptors. */
export function parseSorts(value: string | null): SortDescriptor[] | null {
  if (value === null) return null;
  if (value === "") return [];
  const sorts: SortDescriptor[] = [];
  for (const part of value.split(",")) {
    const [id, direction] = part.split(".");
    if (!isSortField(id) || (direction !== "asc" && direction !== "desc")) return null;
    if (sorts.some((sort) => sort.id === id)) return null;
    sorts.push({ id, desc: direction === "desc" });
  }
  return sorts.length <= MAX_SORTS ? sorts : null;
}

export const serializeSorts = (sorts: SortDescriptor[]) =>
  sorts.map((sort) => `${sort.id}.${sort.desc ? "desc" : "asc"}`).join(",");

/**
 * Reads list parameters from a query string. Invalid values fall back to their defaults and mark
 * the result invalid, so the page can sanitize a hand-edited URL while the API rejects it.
 */
export function readListParams(query: URLSearchParams, fallbackPageSize: PageSize = DEFAULT_PAGE_SIZE) {
  let valid = true;
  const pick = <T,>(key: string, parse: (raw: string) => T | null, fallback: T): T => {
    const raw = query.get(key);
    if (raw === null) return fallback;
    const parsed = parse(raw);
    if (parsed === null) { valid = false; return fallback; }
    return parsed;
  };

  const search = pick(KEYS.search, (raw) => (raw.length <= MAX_SEARCH_LENGTH ? raw : null), "");
  const status = pick(KEYS.status, (raw) => ((STATUS_FILTERS as readonly string[]).includes(raw) ? raw as StatusFilter : null), "active");
  const level = pick(KEYS.level, (raw) => (levelId.safeParse(raw).success ? raw : null), null as string | null);
  const track = pick(KEYS.track, (raw) => (idOrNone.safeParse(raw).success ? raw : null), null as string | null);
  const group = pick(KEYS.group, (raw) => (idOrNone.safeParse(raw).success ? raw : null), null as string | null);
  const type = pick(KEYS.type, (raw) => (isParticipationType(raw) ? raw : null), null as ParticipationType | null);
  const sorts = pick(KEYS.sort, parseSorts, DEFAULT_SORTS);
  const page = pick(KEYS.page, (raw) => (/^[1-9]\d{0,5}$/.test(raw) ? Number(raw) : null), 1);
  const size = pick(KEYS.size, (raw) => { const value = Number(raw); return isPageSize(value) ? value : null; }, fallbackPageSize);

  // A track or group filter only makes sense within a level (track) or alongside it (group).
  const params: StudentListParams = {
    search, status, levelId: level, track: level ? track : null, group, participationType: type,
    sorts, pageIndex: page - 1, pageSize: size,
  };
  if (!level && track) valid = false;
  return { params, valid };
}

/** Writes list parameters to a query string, omitting defaults to keep URLs short. */
export function writeListParams(params: StudentListParams, extra?: Record<string, string>) {
  const query = new URLSearchParams(extra);
  if (params.search) query.set(KEYS.search, params.search);
  if (params.status !== "active") query.set(KEYS.status, params.status);
  if (params.levelId) query.set(KEYS.level, params.levelId);
  if (params.levelId && params.track) query.set(KEYS.track, params.track);
  if (params.group) query.set(KEYS.group, params.group);
  if (params.participationType) query.set(KEYS.type, params.participationType);
  if (serializeSorts(params.sorts) !== serializeSorts(DEFAULT_SORTS)) query.set(KEYS.sort, serializeSorts(params.sorts));
  if (params.pageIndex > 0) query.set(KEYS.page, String(params.pageIndex + 1));
  if (params.pageSize !== DEFAULT_PAGE_SIZE) query.set(KEYS.size, String(params.pageSize));
  return query;
}

/** True when search or any filter narrows the list, not counting the default Active status. */
export const isFiltering = (params: StudentListParams) =>
  Boolean(params.search.trim() || params.status !== "active" || params.levelId || params.track || params.group || params.participationType);

/** The last valid page index for a total, so a page emptied by archiving moves back. */
export const clampPageIndex = (pageIndex: number, total: number, pageSize: number) =>
  Math.min(pageIndex, Math.max(0, Math.ceil(total / pageSize) - 1));
