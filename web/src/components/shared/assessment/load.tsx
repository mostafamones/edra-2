"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { IconAlertCircle } from "@tabler/icons-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  academicYearQueryKey, groupListQueryKey, loadActiveYear, loadGroups, loadStructure, structureQueryKey,
  type Group, type Level, type Track,
} from "@/modules/groups";

export type FormContext = {
  academicYearId: string;
  levels: Level[];
  tracks: Track[];
  levelNames: Record<string, string>;
  groups: Group[];
};

type Props = {
  academyId: string;
  /** "assignment", "quiz" or "exam". */
  noun: string;
  /** The year of the entity being edited; a new entity uses the active year. */
  entityYearId?: string;
  children: (context: FormContext) => ReactNode;
};

/** Loads the academic year, levels, tracks and groups an assessment form needs, with its loading, error and no-year states. */
export function AssessmentFormLoader({ academyId, noun, entityYearId, children }: Props) {
  const yearQuery = useQuery({ queryKey: academicYearQueryKey(academyId), queryFn: () => loadActiveYear(academyId), enabled: !entityYearId });
  const structureQuery = useQuery({ queryKey: structureQueryKey(academyId), queryFn: () => loadStructure(academyId) });
  const groupsQuery = useQuery({ queryKey: groupListQueryKey(academyId, false), queryFn: () => loadGroups(academyId) });
  const queries = [structureQuery, groupsQuery, ...(entityYearId ? [] : [yearQuery])];

  if (queries.some((query) => query.isError)) {
    return (
      <Alert variant="destructive">
        <IconAlertCircle />
        <AlertTitle>Couldn’t load the {noun} form</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-3">
          <span>The academic year, levels, or groups failed to load.</span>
          <Button variant="outline" size="sm" disabled={queries.some((query) => query.isFetching)}
            onClick={() => { for (const query of queries) if (query.isError) void query.refetch(); }}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  if (!structureQuery.data || !groupsQuery.data || (!entityYearId && yearQuery.isPending)) {
    return (
      <div role="status" aria-label={`Loading ${noun} form`} className="flex flex-col gap-6">
        {[10, 24, 16, 30].map((height, index) => (
          <div key={index} aria-hidden="true" className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="w-full" style={{ height: `${height * 0.25}rem` }} />
          </div>
        ))}
      </div>
    );
  }
  const academicYearId = entityYearId ?? yearQuery.data?.id;
  if (!academicYearId) {
    return (
      <Alert>
        <IconAlertCircle />
        <AlertTitle>No active academic year</AlertTitle>
        <AlertDescription>
          {noun.charAt(0).toUpperCase() + noun.slice(1)}s belong to an academic year. Open one for this academy to create {noun}s.
        </AlertDescription>
      </Alert>
    );
  }
  const groups = groupsQuery.data.year?.id === academicYearId ? groupsQuery.data.groups : [];
  return children({ academicYearId, levels: structureQuery.data.levels, tracks: structureQuery.data.tracks, levelNames: structureQuery.data.levelNames, groups });
}
