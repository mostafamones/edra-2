"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { groupListQueryKey, loadGroups, loadStructure, structureQueryKey } from "@/modules/groups";

export type AudienceNames = { levelNames: Record<string, string>; trackNames: Map<string, string>; groupNames: Map<string, string>; historicalTrackNames?: Map<string, string> };

/** Level, track and group names (including archived groups) for describing audiences. */
export function useAudienceNames(academyId: string): AudienceNames {
  const structure = useQuery({ queryKey: structureQueryKey(academyId), queryFn: () => loadStructure(academyId) });
  const active = useQuery({ queryKey: groupListQueryKey(academyId, false), queryFn: () => loadGroups(academyId) });
  const archived = useQuery({ queryKey: groupListQueryKey(academyId, true), queryFn: () => loadGroups(academyId, { archived: true }) });
  return useMemo(() => ({
    levelNames: structure.data?.levelNames ?? {},
    trackNames: new Map((structure.data?.historicalTracks ?? structure.data?.tracks ?? []).map((track) => [track.id, track.name])),
    historicalTrackNames: new Map((structure.data?.trackYearLabels ?? []).map(row => [`${row.academic_year_id}:${row.track_id}`, row.name])),
    groupNames: new Map([...(active.data?.groups ?? []), ...(archived.data?.groups ?? [])].map((group) => [group.id, group.name])),
  }), [structure.data, active.data, archived.data]);
}

/** "Third Preparatory · Science", "Nine A, Nine B", "4 groups", or "No audience yet". */
export function describeAudience(
  value: { audience: string | null; levelId: string | null; trackId: string | null; groupIds: readonly string[]; academicYearId?: string }, names: AudienceNames,
): string {
  if (value.audience === null) return "No audience yet";
  if (value.audience === "groups") {
    const known = value.groupIds.map((id) => names.groupNames.get(id)).filter((name): name is string => Boolean(name));
    if (known.length === value.groupIds.length && known.length <= 3) return known.join(", ");
    return `${value.groupIds.length} group${value.groupIds.length === 1 ? "" : "s"}`;
  }
  const level = value.levelId ? names.levelNames[value.levelId] ?? value.levelId : "";
  const track = value.trackId ? names.historicalTrackNames?.get(`${value.academicYearId}:${value.trackId}`) ?? names.trackNames.get(value.trackId) : undefined;
  return track ? `${level} · ${track}` : level;
}
