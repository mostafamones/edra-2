"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { groupListQueryKey, loadGroups, loadStructure, structureQueryKey } from "@/modules/groups";
import type { AudienceNames } from "./labels";

/** Level, track and group names (including archived groups) for describing audiences. */
export function useAudienceNames(academyId: string): AudienceNames {
  const structure = useQuery({ queryKey: structureQueryKey(academyId), queryFn: () => loadStructure(academyId) });
  const active = useQuery({ queryKey: groupListQueryKey(academyId, false), queryFn: () => loadGroups(academyId) });
  const archived = useQuery({ queryKey: groupListQueryKey(academyId, true), queryFn: () => loadGroups(academyId, { archived: true }) });
  return useMemo(() => ({
    levelNames: structure.data?.levelNames ?? {},
    trackNames: new Map((structure.data?.tracks ?? []).map((track) => [track.id, track.name])),
    groupNames: new Map([...(active.data?.groups ?? []), ...(archived.data?.groups ?? [])].map((group) => [group.id, group.name])),
  }), [structure.data, active.data, archived.data]);
}
