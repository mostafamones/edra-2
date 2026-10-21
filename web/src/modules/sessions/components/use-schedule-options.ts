"use client";

import { useQuery } from "@tanstack/react-query";

import { groupListQueryKey, loadGroups, loadStructure, structureQueryKey } from "@/modules/groups";
import { buildAudienceLookup, loadSchedules, scheduleListQueryKey } from "@/modules/schedules";
import { startableOfferingSchedules } from "@/modules/academies/structure";
import { fetchAllPages } from "@/lib/supabase/paginate";

/** Active schedules with the lookup that turns a schedule into its audience label. */
export function useScheduleOptions(academyId: string, enabled = true) {
  const schedules = useQuery({ queryKey: [...scheduleListQueryKey(academyId, false), "startable"], queryFn: async () => {
    const [data, allowed] = await Promise.all([loadSchedules(academyId), fetchAllPages<{ id: string }>((from, to) =>
      startableOfferingSchedules(academyId).select("id").order("id").range(from, to))]);
    const ids = new Set(allowed.map(row => row.id));
    return { ...data, schedules: data.schedules.filter(schedule => ids.has(schedule.id)) };
  }, enabled });
  const structure = useQuery({ queryKey: structureQueryKey(academyId), queryFn: () => loadStructure(academyId), enabled });
  const groups = useQuery({ queryKey: groupListQueryKey(academyId, false), queryFn: () => loadGroups(academyId), enabled });
  const lookup = structure.data && groups.data
    ? buildAudienceLookup({ groups: groups.data.groups, tracks: structure.data.tracks, levelNames: structure.data.levelNames })
    : null;
  return {
    schedules,
    lookup,
    loading: !schedules.data || !lookup,
    failed: schedules.isError || structure.isError || groups.isError,
  };
}
