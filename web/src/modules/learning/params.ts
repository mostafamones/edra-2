import { UNIT_STATUSES, type UnitStatus } from "./started";

/** Absent for all academies; one academy's slug and a 1-based page when scoped. */
export type Scope = { slug: string; page: number } | undefined;

export function pageParam(value: string | string[] | undefined) {
  return typeof value === "string" && /^[1-9]\d{0,3}$/.test(value) ? Number(value) : 1;
}

/** `?academy=` narrows a list page to one academy, which then pages with `?page=`. */
export function scopeParam({ academy, page }: Record<string, string | string[] | undefined>): Scope {
  return typeof academy === "string" && academy ? { slug: academy, page: pageParam(page) } : undefined;
}

/** Course list settings from the query: search, layout, and which statuses show. */
export function unitListParams({ q, view, status, group }: Record<string, string | string[] | undefined>) {
  const selected = typeof status === "string" ? UNIT_STATUSES.filter((value): value is UnitStatus => status.split(",").includes(value)) : [...UNIT_STATUSES];
  const grouping: "none" | "academy" | "status" = group === "academy" || group === "status" ? group : "none";
  return {
    search: typeof q === "string" ? q.trim().slice(0, 100) : "",
    view: view === "list" ? "list" as const : "grid" as const,
    statuses: selected,
    group: grouping,
  };
}
