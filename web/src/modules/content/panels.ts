import { queryOptions } from "@tanstack/react-query";
import { loadUnitPublication, loadUnitPanels } from "./actions";
import type { UnitPublication } from "./data";
import { unwrapContent } from "./types";

export type UnitPanels = Awaited<ReturnType<typeof loadUnitPanels>>;

/** Shared by the background prefetch and panels, so opening a panel reuses the same request. */
export function unitPanelOptions(academyId: string, unitId: string) {
  return queryOptions({
    queryKey: ["content", academyId, "unit", unitId, "panels"],
    queryFn: () => loadUnitPanels(academyId, unitId),
    staleTime: 60_000,
  });
}

const REFRESH_WHILE_DUE = 30_000, MAX_REFRESH_WAIT = 3_600_000, GIVE_UP_AFTER = 900_000;

/** When to look for the worker's outcome: at the scheduled time, then briefly while it is due. Retries are visible on the next open. */
export function publicationRefresh(schedule: UnitPublication["schedule"] | undefined, now = Date.now()): number | false {
  if (schedule?.state !== "pending") return false;
  const due = Date.parse(schedule.nextAttemptAt ?? schedule.scheduledFor) - now;
  if (due < -GIVE_UP_AFTER) return false;
  return due > REFRESH_WHILE_DUE ? Math.min(due, MAX_REFRESH_WAIT) : REFRESH_WHILE_DUE;
}

/** Manager-only; the account is in the key so a late response can't reach another identity. */
export function publicationOptions(academyId: string, unitId: string, userId: string) {
  return queryOptions({
    queryKey: ["content", academyId, "unit", unitId, "publication", userId],
    queryFn: async () => unwrapContent(await loadUnitPublication(academyId, unitId)),
    staleTime: 60_000,
    refetchInterval: query => publicationRefresh(query.state.data?.schedule),
  });
}
