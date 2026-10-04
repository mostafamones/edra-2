"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  academicYearQueryKey, groupListQueryKey, loadActiveYear, loadGroups, loadStructure, structureQueryKey,
} from "@/modules/groups";
import type { ImportReference } from "../templates";

/** The open year, levels, tracks, and active groups an import maps against, plus their template listing. */
export function useAcademyData(academyId: string) {
  const year = useQuery({ queryKey: academicYearQueryKey(academyId), queryFn: () => loadActiveYear(academyId) });
  const structure = useQuery({ queryKey: structureQueryKey(academyId), queryFn: () => loadStructure(academyId) });
  const groups = useQuery({ queryKey: groupListQueryKey(academyId, false), queryFn: () => loadGroups(academyId) });

  const reference = useMemo<ImportReference | null>(() => {
    if (!structure.data || !groups.data) return null;
    const { levels, tracks, levelNames } = structure.data;
    const trackNames = new Map(tracks.map((track) => [track.id, track.name]));
    return {
      levels: levels.map((level) => ({ id: level.level_id, name: levelNames[level.level_id] ?? level.level_id })),
      tracks: tracks.map((track) => ({ id: track.id, levelId: track.level_id, levelName: levelNames[track.level_id] ?? track.level_id, name: track.name })),
      groups: groups.data.groups.map((group) => ({
        name: group.name,
        levelId: group.level_id,
        trackId: group.track_id,
        levelName: levelNames[group.level_id] ?? group.level_id,
        trackName: group.track_id ? trackNames.get(group.track_id) ?? null : null,
      })),
    };
  }, [structure.data, groups.data]);

  const queries = [year, structure, groups];
  return {
    year: year.data,
    structure: structure.data,
    groups: groups.data?.groups,
    reference,
    loading: queries.some((query) => query.isPending),
    error: queries.some((query) => query.isError),
    retrying: queries.some((query) => query.isFetching),
    retry: () => { for (const query of queries) if (query.isError) void query.refetch(); },
  };
}

export type AcademyData = ReturnType<typeof useAcademyData>;
export const yearLabel = (startYear: number) => `${startYear}–${startYear + 1}`;
