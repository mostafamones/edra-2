"use client";

import { useQuery } from "@tanstack/react-query";

import { AudienceFields } from "@/components/shared/assessment/audience";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { groupListQueryKey, loadGroups, loadStructure, structureQueryKey } from "@/modules/groups";

export function QuickAudience({ academyId, yearId, disabled, optional }: { academyId: string; yearId: string; disabled: boolean; optional: boolean }) {
  const structure = useQuery({ queryKey: structureQueryKey(academyId), queryFn: () => loadStructure(academyId) });
  const groups = useQuery({ queryKey: groupListQueryKey(academyId, false), queryFn: () => loadGroups(academyId) });
  if (structure.isError || groups.isError) return <div role="alert" className="space-y-2"><p>Couldn’t load audience options.</p><Button type="button" size="sm" variant="outline" onClick={() => { void structure.refetch(); void groups.refetch(); }}>Retry audience</Button></div>;
  if (!structure.data || !groups.data) return <Skeleton className="h-20" />;
  return <AudienceFields idPrefix="quick-audience" levelTrackClassName="gap-2" levels={structure.data.levels} tracks={structure.data.tracks} levelNames={structure.data.levelNames}
    groups={groups.data.year?.id === yearId ? groups.data.groups : []} disabled={disabled} optional={optional} />;
}
