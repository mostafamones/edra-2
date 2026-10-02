"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, Plus, SearchIcon, SearchX, UsersRound } from "lucide-react";

import { FilterPopover } from "@/components/shared/filter-popover";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { AcademyGate } from "@/modules/auth";
import type { AcademyEntry } from "@/modules/academies";
import { archiveGroup, restoreGroup } from "../actions";
import {
  groupDependencyQueryKey, groupListQueryKey, groupsRootKey, loadGroups, loadScheduledGroupIds,
  loadStructure, structureQueryKey, type Group, type Level, type Track,
} from "../queries";
import { GroupCard } from "./card";
import { GroupForm } from "./group-form";

const ALL_LEVELS = "all";
const GRID = "grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";

export function GroupsPage() {
  return <AcademyGate>{(academy) => <GroupsContent academy={academy} />}</AcademyGate>;
}

function GroupsContent({ academy }: { academy: AcademyEntry }) {
  const academyId = academy.id;
  const queryClient = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState(ALL_LEVELS);
  const [editing, setEditing] = useState<Group | null>(null);
  const [archiving, setArchiving] = useState<Group | null>(null);
  const [actionError, setActionError] = useState("");
  const [archivingBusy, setArchivingBusy] = useState(false);
  const canManage = academy.role === "owner" || academy.role === "admin";
  const groupsQuery = useQuery({ queryKey: groupListQueryKey(academyId, showArchived), queryFn: () => loadGroups(academyId, { archived: showArchived }) });
  const structureQuery = useQuery({ queryKey: structureQueryKey(academyId), queryFn: () => loadStructure(academyId) });
  const dependencyQuery = useQuery({ queryKey: groupDependencyQueryKey(academyId), queryFn: () => loadScheduledGroupIds(academyId) });
  const isPending = groupsQuery.isPending || structureQuery.isPending || dependencyQuery.isPending;
  const isError = groupsQuery.isError || structureQuery.isError || dependencyQuery.isError;
  const refetch = () => { void groupsQuery.refetch(); void structureQuery.refetch(); void dependencyQuery.refetch(); };
  const data = groupsQuery.data && structureQuery.data && dependencyQuery.data
    ? { year: groupsQuery.data.year, groups: groupsQuery.data.groups, ...structureQuery.data, scheduledGroupIds: new Set(dependencyQuery.data) }
    : undefined;
  const visibleGroups = data ? filterAndSort(data, search, levelFilter) : [];
  const filtering = search.trim() !== "" || levelFilter !== ALL_LEVELS;
  const usedLevels = data?.levels.filter((level) => data.groups.some((group) => group.level_id === level.level_id)) ?? [];

  async function archive() {
    if (!archiving) return;
    setActionError(""); setArchivingBusy(true);
    try {
      const result = await archiveGroup(academyId, archiving.id);
      if (!result.ok) { setActionError(result.message); return; }
      setArchiving(null);
      await queryClient.invalidateQueries({ queryKey: groupsRootKey(academyId) });
    } catch { setActionError("Could not archive the group."); }
    finally { setArchivingBusy(false); }
  }

  async function restore(group: Group) {
    try {
      const result = await restoreGroup(academyId, group.id);
      if (!result.ok) { toast.error(result.message); return; }
      toast.success(`${group.name} is active again.`);
      await queryClient.invalidateQueries({ queryKey: groupsRootKey(academyId) });
    } catch { toast.error("Could not unarchive the group."); }
  }

  function clearFilters() { setSearch(""); setLevelFilter(ALL_LEVELS); }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="font-heading text-2xl font-bold tracking-tight">Groups</h1>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <InputGroup className="sm:max-w-sm">
          <InputGroupInput
            type="search"
            placeholder="Search groups or tracks"
            aria-label="Search groups"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <InputGroupAddon><SearchIcon /></InputGroupAddon>
        </InputGroup>
        <FilterPopover fields={[
            {
              id: "status", label: "Status", value: showArchived ? "archived" : "active", defaultValue: "active",
              options: [{ value: "active", label: "Active" }, { value: "archived", label: "Archived" }],
              onChange: (value) => setShowArchived(value === "archived"),
            },
            {
              id: "level", label: "Level", value: levelFilter, defaultValue: ALL_LEVELS,
              options: [{ value: ALL_LEVELS, label: "All levels" }, ...usedLevels.map((level) => ({ value: level.level_id, label: data?.levelNames[level.level_id] ?? level.level_id }))],
              onChange: setLevelFilter,
            },
          ]}>
          {canManage && <Button asChild className="flex-1 sm:flex-none"><Link href="/app/groups/new"><Plus />Create group</Link></Button>}
        </FilterPopover>
      </div>

      {isPending && (
        <div role="status" aria-label="Loading groups" className={GRID}>
          {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)}
        </div>
      )}

      {isError && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Could not load groups</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            Check your connection and try again.
            <Button variant="outline" size="sm" onClick={refetch}>Retry</Button>
          </AlertDescription>
        </Alert>
      )}

      {data && !data.year && (
        <Alert>
          <AlertCircle />
          <AlertTitle>No active academic year</AlertTitle>
          <AlertDescription>Groups belong to an academic year. Open one for this academy to start creating groups.</AlertDescription>
        </Alert>
      )}

      {data?.year && (data.groups.length === 0 ? (
        <Empty className="min-h-64 rounded-xl border border-dashed border-border bg-card/20 py-20">
          <EmptyHeader className="gap-1">
            <EmptyMedia variant="icon"><UsersRound aria-hidden="true" /></EmptyMedia>
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
              : canManage && <Button size="sm" asChild><Link href="/app/groups/new"><Plus />Create group</Link></Button>}
          </EmptyContent>
        </Empty>
      ) : visibleGroups.length === 0 ? (
        <Empty className="min-h-48 rounded-xl border border-dashed border-border py-14">
          <EmptyHeader className="gap-1">
            <EmptyMedia variant="icon"><SearchX aria-hidden="true" /></EmptyMedia>
            <EmptyTitle>No matching groups</EmptyTitle>
            <EmptyDescription>Try a different name, or clear the filters to see every group.</EmptyDescription>
          </EmptyHeader>
          {filtering && <EmptyContent><Button size="sm" variant="outline" onClick={clearFilters}>Clear filters</Button></EmptyContent>}
        </Empty>
      ) : (
        <div className={GRID}>
          {visibleGroups.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              levelName={data.levelNames[group.level_id] ?? group.level_id}
              trackName={data.tracks.find((track) => track.id === group.track_id)?.name}
              scheduled={data.scheduledGroupIds.has(group.id)}
              onEdit={canManage && !showArchived ? () => setEditing(group) : undefined}
              onArchive={canManage && !showArchived ? () => { setActionError(""); setArchiving(group); } : undefined}
              onRestore={canManage && showArchived ? () => void restore(group) : undefined}
            />
          ))}
        </div>
      ))}

      {data && !showArchived && (
        <Sheet open={Boolean(editing)} onOpenChange={(open) => { if (!open) setEditing(null); }}>
          <SheetContent className="overflow-hidden sm:max-w-lg">
            <SheetHeader className="shrink-0 px-6 pt-4 pb-2 pr-16">
              <SheetTitle className="break-words text-base font-medium leading-8">
                Edit: <span className="font-bold">{editing?.name}</span>
              </SheetTitle>
            </SheetHeader>
            <div className="flex min-h-0 flex-1">
              {editing && (
                <GroupForm
                  key={editing.id}
                  academy={academy}
                  group={editing}
                  levels={data.levels}
                  tracks={data.tracks}
                  levelNames={data.levelNames}
                  programLocked={data.scheduledGroupIds.has(editing.id)}
                  sheetLayout
                  onSaved={() => setEditing(null)}
                  onCancel={() => setEditing(null)}
                />
              )}
            </div>
          </SheetContent>
        </Sheet>
      )}

      <AlertDialog open={Boolean(archiving)} onOpenChange={(open) => { if (!open && !archivingBusy) setArchiving(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {archiving?.name}?</AlertDialogTitle>
            <AlertDialogDescription>It will move to Archived for this academic year. Archived groups can no longer be edited.</AlertDialogDescription>
          </AlertDialogHeader>
          {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archivingBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={(event) => { event.preventDefault(); void archive(); }} disabled={archivingBusy}>
              {archivingBusy ? "Archiving…" : "Archive group"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

/** Applies the search and level filter, ordered by the academy's level order, then track order and name. */
function filterAndSort(data: { groups: Group[]; levels: Level[]; tracks: Track[] }, search: string, levelFilter: string) {
  const term = search.trim().toLowerCase();
  const tracks = new Map(data.tracks.map((track) => [track.id, track]));
  const levelOrder = new Map(data.levels.map((level) => [level.level_id, level.sort_order]));
  const order = (group: Group) => [levelOrder.get(group.level_id) ?? Infinity, tracks.get(group.track_id ?? "")?.sort_order ?? -1];
  return data.groups
    .filter((group) =>
      (levelFilter === ALL_LEVELS || group.level_id === levelFilter)
      && (!term || group.name.toLowerCase().includes(term)
        || Boolean(group.track_id && tracks.get(group.track_id)?.name.toLowerCase().includes(term))))
    .sort((a, b) => {
      const [aLevel, aTrack] = order(a), [bLevel, bTrack] = order(b);
      return aLevel - bLevel || aTrack - bTrack || a.name.localeCompare(b.name);
    });
}
