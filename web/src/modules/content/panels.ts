"use client";

import { queryOptions } from "@tanstack/react-query";
import { loadUnitPanels } from "./actions";

export type UnitPanels = Awaited<ReturnType<typeof loadUnitPanels>>;

/** Shared by the background prefetch and panels, so opening a panel reuses the same request. */
export function unitPanelOptions(academyId: string, unitId: string) {
  return queryOptions({
    queryKey: ["content", academyId, "unit", unitId, "panels"],
    queryFn: () => loadUnitPanels(academyId, unitId),
    staleTime: 60_000,
  });
}
