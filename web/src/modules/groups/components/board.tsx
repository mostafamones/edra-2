"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, AlertCircleIcon, SearchRemoveIcon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { FilterPopover } from "@/components/shared/filter-popover";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { isAcademyManager, type AcademyEntry } from "@/modules/academies";
import { useCanonicalHref } from "@/modules/navigation";
import { archiveGroup, restoreGroup } from "../actions";
import {
  groupDependencyQueryKey, groupListQueryKey, groupsRootKey, loadGroupDependencies, loadGroups,
  loadStructure, structureQueryKey, type Group, type GroupDependencies, type Level, type Track,
} from "../queries";
import { patchGroupLists } from "../optimistic";
import { GroupCard } from "./card";
import { GroupForm } from "./group-form";

const ALL = "all";
/** Filter value for level-wide groups, which have no track. */
const LEVEL_WIDE = "level-wide";
const GRID = "grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";

type Props = {
  academy: AcademyEntry;
  /** Single-column cards and an icon-only create button, for the students page panel. */
  compact?: boolean;
  /** Shown at the start of the toolbar row. */
  title: ReactNode;
  /** The group whose roster is showing; its card is highlighted. */
  selectedId?: string | null;
  /** Clicking a card shows its roster; by default this opens the students page filtered to the group. */
  onOpen?: (group: Group) => void;
};

/** Group cards with level, track, and archive filters, and in-place create, edit, archive, and restore. */
export function GroupsBoard({ academy, compact = false, title, selectedId, onOpen }: Props) {
  const academyId = academy.id;
  const href = useCanonicalHref();
  const router = useRouter();
  const open = onOpen ?? ((group: Group) => router.push(href(`/app/students?group=${group.id}`)));
  const queryClient = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [levelFilter, setLevelFilter] = useState(ALL);
  const [trackFilter, setTrackFilter] = useState(ALL);
  // `null` is closed; `"new"` creates a group.
  const [editing, setEditing] = useState<Group | "new" | null>(null);
  const [archiving, setArchiving] = useState<Group | null>(null);
  const canManage = isAcademyManager(academy.role);
  const groupsQuery = useQuery({ queryKey: groupListQueryKey(academyId, showArchived), queryFn: () => loadGroups(academyId, { archived: showArchived }) });
  const structureQuery = useQuery({ queryKey: structureQueryKey(academyId), queryFn: () => loadStructure(academyId) });
  const dependencyQuery = useQuery({ queryKey: groupDependencyQueryKey(academyId), queryFn: () => loadGroupDependencies(academyId) });
  const isPending = groupsQuery.isPending || structureQuery.isPending || dependencyQuery.isPending;
  const isError = groupsQuery.isError || structureQuery.isError || dependencyQuery.isError;
  const refetch = () => { void groupsQuery.refetch(); void structureQuery.refetch(); void dependencyQuery.refetch(); };
  const data = groupsQuery.data && structureQuery.data && dependencyQuery.data
    ? { year: groupsQuery.data.year, groups: groupsQuery.data.groups, ...structureQuery.data, dependencies: dependencyQuery.data }
    : undefined;
  const visibleGroups = data ? filterAndSort(data, levelFilter, trackFilter) : [];
  const filtering = levelFilter !== ALL || trackFilter !== ALL;
  const usedLevels = data?.historicalLevels.filter((level) => data.groups.some((group) => group.level_id === level.level_id)) ?? [];
  const levelTracks = data?.historicalTracks
    .filter((track) => track.level_id === levelFilter && data.groups.some((group) => group.track_id === track.id))
    .sort((a, b) => a.sort_order - b.sort_order) ?? [];

  /** Moves a group between the cached lists immediately; the server result confirms or rolls it back. */
  async function move(group: Group, toArchived: boolean, run: () => ReturnType<typeof archiveGroup>, failure: string, success?: string) {
    const archivedAt = new Date().toISOString();
    const rollback = await patchGroupLists(queryClient, academyId, (groups, archivedList) =>
      archivedList === toArchived
        ? [...groups, { ...group, archived_at: toArchived ? archivedAt : null }]
        : groups.filter((item) => item.id !== group.id));
    try {
      const result = await run();
      if (!result.ok) { rollback(); toast.error(result.message); return; }
      if (success) toast.success(success);
    } catch { rollback(); toast.error(failure); }
    finally { void queryClient.invalidateQueries({ queryKey: groupsRootKey(academyId) }); }
  }

  function archive() {
    if (!archiving) return;
    const group = archiving;
    setArchiving(null);
    void move(group, true, () => archiveGroup(academyId, group.id), "Could not archive the group.");
  }

  function restore(group: Group) {
    void move(group, false, () => restoreGroup(academyId, group.id), "Could not unarchive the group.", `${group.name} is active again.`);
  }

  function clearFilters() { setLevelFilter(ALL); setTrackFilter(ALL); }

  return (
    <>
      <div className="flex min-h-9 items-center gap-2">
        {title}
        <div className="ml-auto flex gap-2">
          <FilterPopover iconOnly fields={[
            {
              id: "status", label: "Status", value: showArchived ? "archived" : "active", defaultValue: "active", toggleLabel: "Show archived",
              options: [{ value: "active", label: "Active" }, { value: "archived", label: "Archived" }],
              onChange: (value) => setShowArchived(value === "archived"),
            },
            {
              id: "level", label: "Level", value: levelFilter, defaultValue: ALL,
              options: [{ value: ALL, label: "All levels" }, ...usedLevels.map((level) => ({ value: level.level_id, label: data?.levelNames[level.level_id] ?? level.level_id }))],
              onChange: (value) => { setLevelFilter(value); setTrackFilter(ALL); },
            },
            ...(levelTracks.length > 0 ? [{
              id: "track", label: "Track", value: trackFilter, defaultValue: ALL,
              options: [
                { value: ALL, label: "All tracks" },
                { value: LEVEL_WIDE, label: "No track" },
                ...levelTracks.map((track) => ({ value: track.id, label: track.name })),
              ],
              onChange: setTrackFilter,
            }] : []),
          ]}>
            {canManage && (compact
              ? <Button variant="outline" size="icon" aria-label="Create group" onClick={() => setEditing("new")}><HugeiconsIcon icon={Add01Icon} /></Button>
              : <Button variant="outline" onClick={() => setEditing("new")}><HugeiconsIcon icon={Add01Icon} />Create group</Button>)}
          </FilterPopover>
        </div>
      </div>

      {isPending && (
        <div role="status" aria-label="Loading groups" className={compact ? "grid gap-3" : GRID}>
          {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)}
        </div>
      )}

      {isError && (
        <Alert variant="destructive">
          <HugeiconsIcon icon={AlertCircleIcon} />
          <AlertTitle>Could not load groups</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            Check your connection and try again.
            <Button variant="outline" size="sm" onClick={refetch}>Retry</Button>
          </AlertDescription>
        </Alert>
      )}

      {data && !data.year && (
        <Alert>
          <HugeiconsIcon icon={AlertCircleIcon} />
          <AlertTitle>No active academic year</AlertTitle>
          <AlertDescription>Groups belong to an academic year. Open one for this academy to start creating groups.</AlertDescription>
        </Alert>
      )}

      {data?.year && (data.groups.length === 0 ? (
        <Empty className="min-h-64 rounded-xl border border-dashed border-border bg-card/20 py-20">
          <EmptyHeader className="gap-1">
            <EmptyMedia variant="icon"><HugeiconsIcon icon={UserGroupIcon} aria-hidden="true" /></EmptyMedia>
            <EmptyTitle className="text-xl font-semibold">{showArchived ? "No archived groups" : "No groups yet"}</EmptyTitle>
            <EmptyDescription className="leading-[1.4em]">
              {showArchived
                ? "Groups you archive this academic year will appear here."
                : "Create a group for your students to enroll in and start their learning journey."}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="w-full flex-row justify-center gap-2">
            {showArchived
              ? <Button size="sm" variant="outline" onClick={() => setShowArchived(false)}>View active groups</Button>
              : canManage && <Button size="sm" onClick={() => setEditing("new")}><HugeiconsIcon icon={Add01Icon} />Create group</Button>}
          </EmptyContent>
        </Empty>
      ) : visibleGroups.length === 0 ? (
        <Empty className="min-h-48 rounded-xl border border-dashed border-border py-14">
          <EmptyHeader className="gap-1">
            <EmptyMedia variant="icon"><HugeiconsIcon icon={SearchRemoveIcon} aria-hidden="true" /></EmptyMedia>
            <EmptyTitle>No matching groups</EmptyTitle>
            <EmptyDescription>Try a different name, or clear the filters to see every group.</EmptyDescription>
          </EmptyHeader>
          {filtering && <EmptyContent><Button size="sm" variant="outline" onClick={clearFilters}>Clear filters</Button></EmptyContent>}
        </Empty>
      ) : (
        <div className={compact ? "grid gap-3" : GRID}>
          {visibleGroups.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              levelName={data.levelNames[group.level_id] ?? group.level_id}
              trackName={data.historicalTracks.find((track) => track.id === group.track_id)?.name}
              scheduled={data.dependencies.scheduledGroupIds.has(group.id)}
              hasStudents={data.dependencies.studentGroupIds.has(group.id)}
              activeStudents={data.dependencies.activeStudentCounts.get(group.id) ?? 0}
              selected={group.id === selectedId}
              onOpen={() => open(group)}
              onEdit={canManage && !showArchived ? () => setEditing(group) : undefined}
              onArchive={canManage && !showArchived ? () => setArchiving(group) : undefined}
              onRestore={canManage && showArchived ? () => void restore(group) : undefined}
            />
          ))}
        </div>
      ))}

      {data && (!showArchived || editing === "new") && (
        <Sheet open={Boolean(editing)} onOpenChange={(open) => { if (!open) setEditing(null); }}>
          <SheetContent className="overflow-hidden sm:max-w-xl">
            <SheetHeader className="shrink-0 px-6 pt-4 pb-2 pr-16">
              <SheetTitle className="break-words text-base font-medium leading-8">
                {editing === "new" ? "Create group" : <>Edit: <span className="font-bold">{editing?.name}</span></>}
              </SheetTitle>
            </SheetHeader>
            <div className="flex min-h-0 flex-1">
              {editing && (
                <GroupForm
                  key={editing === "new" ? "new" : editing.id}
                  academy={academy}
                  group={editing === "new" ? undefined : editing}
                  levels={data.levels}
                  tracks={data.tracks}
                  levelNames={data.levelNames}
                  programLock={editing === "new" ? undefined : programLockReason(data.dependencies, editing.id)}
                  sheetLayout
                  onSaved={() => setEditing(null)}
                  onCancel={() => setEditing(null)}
                />
              )}
            </div>
          </SheetContent>
        </Sheet>
      )}

      <AlertDialog open={Boolean(archiving)} onOpenChange={(open) => { if (!open) setArchiving(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {archiving?.name}?</AlertDialogTitle>
            <AlertDialogDescription>It will move to Archived for this academic year. Archived groups can no longer be edited.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={archive}>
              Archive group
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Applies the level and track filters, ordered by the academy's level order, then track order and name. */
function filterAndSort(data: { groups: Group[]; levels: Level[]; tracks: Track[]; historicalLevels: Level[]; historicalTracks: Track[] }, levelFilter: string, trackFilter: string) {
  const tracks = new Map(data.historicalTracks.map((track) => [track.id, track]));
  const levelOrder = new Map(data.historicalLevels.map((level) => [level.level_id, level.sort_order]));
  const order = (group: Group) => [levelOrder.get(group.level_id) ?? Infinity, tracks.get(group.track_id ?? "")?.sort_order ?? -1];
  return data.groups
    .filter((group) =>
      (levelFilter === ALL || group.level_id === levelFilter)
      && (trackFilter === ALL || (trackFilter === LEVEL_WIDE ? group.track_id === null : group.track_id === trackFilter)))
    .sort((a, b) => {
      const [aLevel, aTrack] = order(a), [bLevel, bTrack] = order(b);
      return aLevel - bLevel || aTrack - bTrack || a.name.localeCompare(b.name);
    });
}

/** Why a group's level and track cannot change, or undefined when they can. */
function programLockReason(dependencies: GroupDependencies, groupId: string) {
  const scheduled = dependencies.scheduledGroupIds.has(groupId);
  const hasStudents = dependencies.studentGroupIds.has(groupId);
  if (scheduled && hasStudents) return "Level and track can’t change because this group has schedules and student records.";
  if (scheduled) return "Level and track can’t change because this group has a schedule.";
  if (hasStudents) return "Level and track can’t change because student records are placed in this group.";
  return undefined;
}
