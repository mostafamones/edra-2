import { z } from "zod";

import { ASSESSMENT_TYPES, DEFAULT_STATUSES, STATUS_KEYS, type AssessmentType, type StatusKey } from "./types";

export const ALL = "all";
/** `program` covers whole-level and level-and-track audiences. */
export const AUDIENCES = ["program", "groups"] as const;
export const SORTS = ["newest", "title"] as const;
export const GROUPS = ["none", "type", "status"] as const;
export const PAGE_SIZE = 24;
export const PAGE_SIZES = [12, 24, 48, 96] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const MAX_SEARCH = 200;
export const MAX_LABELS = 100;
/** The `labels` URL value meaning Unlabeled. */
export const UNLABELED = "none";
const LEVEL = z.string().regex(/^[a-z0-9-]{1,40}$/);

export type AssessmentListParams = {
  type: AssessmentType | typeof ALL;
  search: string;
  audience: (typeof AUDIENCES)[number] | typeof ALL;
  /** Level ID; matches program audiences of the level and group audiences with a group in it. */
  level: string | null;
  /** Track ID (program-wide only) and audience group ID (group-wide only). */
  track: string | null;
  groupId: string | null;
  /** Shown statuses, in `STATUS_KEYS` order. */
  statuses: StatusKey[];
  /** Label IDs, sorted; an assessment with any of them matches. Never set together with `unlabeled`. */
  labels: string[];
  unlabeled: boolean;
  sort: (typeof SORTS)[number];
  group: (typeof GROUPS)[number];
  /** Zero-based; the URL shows it one-based. */
  page: number;
  pageSize: PageSize;
};

export const DEFAULT_PARAMS: AssessmentListParams = { type: ALL, search: "", audience: ALL, level: null, track: null, groupId: null, statuses: [...DEFAULT_STATUSES], labels: [], unlabeled: false, sort: "newest", group: "none", page: 0, pageSize: PAGE_SIZE };

const oneOf = <T extends string>(values: readonly T[], raw: string | null): T | null =>
  raw !== null && (values as readonly string[]).includes(raw) ? raw as T : null;

/** A comma list of known type:status keys, kept in canonical order; anything unknown means the default. */
function readStatuses(raw: string | null): StatusKey[] {
  if (raw === null) return [...DEFAULT_STATUSES];
  const chosen = new Set(raw === "" ? [] : raw.split(","));
  if ([...chosen].some((key) => !(STATUS_KEYS as readonly string[]).includes(key))) return [...DEFAULT_STATUSES];
  return STATUS_KEYS.filter((key) => chosen.has(key));
}

/** `none` is Unlabeled; otherwise a comma list of label IDs. Anything invalid means no label filter. */
function readLabels(raw: string | null): Pick<AssessmentListParams, "labels" | "unlabeled"> {
  if (raw === UNLABELED) return { labels: [], unlabeled: true };
  const ids = [...new Set(raw ? raw.split(",") : [])];
  if (ids.length > MAX_LABELS || !ids.every((id) => z.guid().safeParse(id).success)) return { labels: [], unlabeled: false };
  return { labels: ids.map((id) => id.toLowerCase()).sort(), unlabeled: false };
}

export const sameStatuses = (a: readonly StatusKey[], b: readonly StatusKey[]) => a.length === b.length && a.every((key) => b.includes(key));

/** Reads list state from the URL; anything invalid falls back to its default. */
export function readParams(query: URLSearchParams): AssessmentListParams {
  const page = Number(query.get("page"));
  const search = query.get("q") ?? "";
  const size = Number(query.get("pageSize"));
  return {
    type: oneOf([ALL, ...ASSESSMENT_TYPES], query.get("type")) ?? ALL,
    search: search.length <= MAX_SEARCH ? search : "",
    audience: oneOf([ALL, ...AUDIENCES], query.get("audience")) ?? ALL,
    level: LEVEL.safeParse(query.get("level")).success ? query.get("level") : null,
    track: z.guid().safeParse(query.get("track")).success ? query.get("track") : null,
    groupId: z.guid().safeParse(query.get("groupId")).success ? query.get("groupId") : null,
    statuses: readStatuses(query.get("statuses")),
    ...readLabels(query.get("labels")),
    sort: oneOf(SORTS, query.get("sort")) ?? "newest",
    group: oneOf(GROUPS, query.get("group")) ?? "none",
    page: Number.isInteger(page) && page >= 1 && page <= 10_000 ? page - 1 : 0,
    pageSize: PAGE_SIZES.includes(size as PageSize) ? size as PageSize : PAGE_SIZE,
  };
}

/** The URL form of the list state, omitting defaults. */
export function writeParams(params: AssessmentListParams): URLSearchParams {
  const query = new URLSearchParams();
  if (params.type !== ALL) query.set("type", params.type);
  if (params.search) query.set("q", params.search);
  if (params.audience !== ALL) query.set("audience", params.audience);
  if (params.level) query.set("level", params.level);
  if (params.track) query.set("track", params.track);
  if (params.groupId) query.set("groupId", params.groupId);
  if (!sameStatuses(params.statuses, DEFAULT_STATUSES)) query.set("statuses", params.statuses.join(","));
  if (params.unlabeled) query.set("labels", UNLABELED);
  else if (params.labels.length) query.set("labels", [...params.labels].sort().join(","));
  if (params.sort !== "newest") query.set("sort", params.sort);
  if (params.group !== "none") query.set("group", params.group);
  if (params.pageSize !== PAGE_SIZE) query.set("pageSize", String(params.pageSize));
  if (params.page > 0) query.set("page", String(params.page + 1));
  return query;
}

/** Applies a change; anything but paging returns to the first page. */
export function changeParams(current: AssessmentListParams, change: Partial<AssessmentListParams>): AssessmentListParams {
  return { ...current, ...change, page: "page" in change ? change.page ?? 0 : 0 };
}
