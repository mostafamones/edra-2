"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  IconAlertCircle, IconChevronLeft, IconChevronRight, IconFilePencil, IconPlus, IconSearch, IconSearchOff,
} from "@tabler/icons-react";

import { FilterPopover } from "@/components/shared/filter-popover";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import type { AcademyEntry } from "@/modules/academies";
import { AcademyGate } from "@/modules/auth";
import { groupListQueryKey, loadGroups, loadStructure, structureQueryKey } from "@/modules/groups";
import { useCanonicalHref } from "@/modules/navigation";
import {
  ALL, assignmentListQueryKey, DEFAULT_LIST_FILTERS, LIST_PAGE_SIZE, loadAssignments, loadYears, yearsQueryKey,
  type AssignmentListFilters,
} from "../../queries";
import { ASSIGNMENT_AUDIENCES, ASSIGNMENT_STATES } from "../../types";
import { AssignmentCard } from "./card";
import { AUDIENCE_LABELS, STATE_LABELS } from "../shared/labels";
import { describeAudience } from "@/components/shared/assessment/workspace/names";

/** `/app/assignments`: every assignment in the academy, searchable and filterable. */
export function AssignmentsPage() {
  // The gate re-mounts the content per academy, which resets filters and paging.
  return <AcademyGate>{(academy) => <ListContent academy={academy} />}</AcademyGate>;
}

const number = new Intl.NumberFormat("en");
const GRID = "grid gap-3 sm:grid-cols-2 lg:grid-cols-3";

function useDebounced<T>(value: T, delay: number) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

function ListContent({ academy }: { academy: AcademyEntry }) {
  const href = useCanonicalHref();
  const academyId = academy.id;
  const yearsQuery = useQuery({ queryKey: yearsQueryKey(academyId), queryFn: () => loadYears(academyId) });
  const structureQuery = useQuery({ queryKey: structureQueryKey(academyId), queryFn: () => loadStructure(academyId) });
  const activeGroupsQuery = useQuery({ queryKey: groupListQueryKey(academyId, false), queryFn: () => loadGroups(academyId) });
  const archivedGroupsQuery = useQuery({ queryKey: groupListQueryKey(academyId, true), queryFn: () => loadGroups(academyId, { archived: true }) });

  const openYear = yearsQuery.data?.find((year) => year.open)?.id;
  const [chosen, setChosen] = useState<Omit<AssignmentListFilters, "yearId"> & { yearId?: string }>(DEFAULT_LIST_FILTERS);
  // The active year is the default; the academy may have none, then every year is shown.
  const filters: AssignmentListFilters = { ...chosen, yearId: chosen.yearId ?? openYear ?? ALL };
  const search = useDebounced(filters.search, 250);
  // Query keys are hashed by value, so a fresh object per render is fine.
  const applied = { ...filters, search };
  const [page, setPage] = useState(0);
  const filtering = filters.search.trim() !== "" || filters.state !== DEFAULT_LIST_FILTERS.state
    || filters.audience !== ALL || (chosen.yearId !== undefined && chosen.yearId !== openYear);

  const listQuery = useQuery({
    queryKey: assignmentListQueryKey(academyId, applied, page),
    queryFn: () => loadAssignments(academyId, applied, page),
    enabled: yearsQuery.isSuccess,
    placeholderData: keepPreviousData,
  });

  const names = useMemo(() => ({
    levelNames: structureQuery.data?.levelNames ?? {},
    trackNames: new Map((structureQuery.data?.tracks ?? []).map((track) => [track.id, track.name])),
    groupNames: new Map([...(activeGroupsQuery.data?.groups ?? []), ...(archivedGroupsQuery.data?.groups ?? [])].map((group) => [group.id, group.name])),
  }), [structureQuery.data, activeGroupsQuery.data, archivedGroupsQuery.data]);

  const set = (change: Partial<AssignmentListFilters>) => { setChosen((current) => ({ ...current, ...change })); setPage(0); };
  const clear = () => { setChosen(DEFAULT_LIST_FILTERS); setPage(0); };
  const failed = yearsQuery.isError || listQuery.isError;
  const data = listQuery.data;
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / LIST_PAGE_SIZE));
  const yearLabel = (startYear: number) => `${startYear}–${String(startYear + 1).slice(-2)}`;

  return (
    <main className="page-shell">
      <h1 className="font-heading text-2xl font-bold tracking-tight">Assignments</h1>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <InputGroup className="sm:max-w-sm">
          <InputGroupInput
            type="search"
            placeholder="Search assignments"
            aria-label="Search assignments"
            value={filters.search}
            onChange={(event) => set({ search: event.target.value })}
          />
          <InputGroupAddon><IconSearch /></InputGroupAddon>
        </InputGroup>
        <div className="flex gap-2 sm:ml-auto">
          <FilterPopover iconOnly fields={[
            {
              id: "year", label: "Academic year", value: filters.yearId, defaultValue: openYear ?? ALL,
              options: [{ value: ALL, label: "All years" }, ...(yearsQuery.data ?? []).map((year) => ({
                value: year.id, label: `${yearLabel(year.startYear)}${year.open ? " (active)" : ""}`,
              }))],
              onChange: (yearId) => set({ yearId }),
            },
            {
              id: "state", label: "State", value: filters.state, defaultValue: DEFAULT_LIST_FILTERS.state,
              options: [
                { value: "unarchived", label: "All but archived" }, { value: ALL, label: "All states" },
                ...ASSIGNMENT_STATES.map((state) => ({ value: state, label: STATE_LABELS[state] })),
              ],
              onChange: (state) => set({ state: state as AssignmentListFilters["state"] }),
            },
            {
              id: "audience", label: "Audience", value: filters.audience, defaultValue: ALL,
              options: [{ value: ALL, label: "All audiences" }, ...ASSIGNMENT_AUDIENCES.map((audience) => ({ value: audience, label: AUDIENCE_LABELS[audience] }))],
              onChange: (audience) => set({ audience: audience as AssignmentListFilters["audience"] }),
            },
          ]} />
          <Button asChild className="flex-1 sm:flex-none"><Link href={href("/app/assignments/new")}><IconPlus />Create assignment</Link></Button>
        </div>
      </div>

      {failed && (
        <Alert variant="destructive">
          <IconAlertCircle />
          <AlertTitle>{data ? "Couldn’t refresh assignments" : "Couldn’t load assignments"}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            {data ? "Showing the last loaded assignments." : "Check your connection and try again."}
            <Button variant="outline" size="sm" disabled={listQuery.isFetching || yearsQuery.isFetching}
              onClick={() => { if (yearsQuery.isError) void yearsQuery.refetch(); else void listQuery.refetch(); }}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {!data && !failed && (
        <div role="status" aria-label="Loading assignments" className={GRID}>
          {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-40 rounded-lg" />)}
        </div>
      )}

      {data && (data.total === 0 ? (filtering ? (
        <Empty className="min-h-48 rounded-xl border border-dashed border-border py-14">
          <EmptyHeader className="gap-1">
            <EmptyMedia variant="icon"><IconSearchOff aria-hidden="true" /></EmptyMedia>
            <EmptyTitle>No matching assignments</EmptyTitle>
            <EmptyDescription>Try a different search, or clear the filters to see every assignment.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent><Button size="sm" variant="outline" onClick={clear}>Clear filters</Button></EmptyContent>
        </Empty>
      ) : (
        <Empty className="min-h-64 rounded-xl border border-dashed border-border bg-card/20 py-20">
          <EmptyHeader className="gap-1">
            <EmptyMedia variant="icon"><IconFilePencil aria-hidden="true" /></EmptyMedia>
            <EmptyTitle className="text-xl font-semibold">No assignments yet</EmptyTitle>
            <EmptyDescription className="leading-[1.4em]">Create homework for a level, track, or groups, hand it out, then mark it and announce results.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" asChild><Link href={href("/app/assignments/new")}><IconPlus />Create assignment</Link></Button>
          </EmptyContent>
        </Empty>
      )) : (
        <div className="flex flex-col gap-3">
          <div className={GRID}>
            {data.rows.map((row) => (
              <AssignmentCard
                key={row.id}
                href={href(`/app/assignments/${row.id}`)}
                title={row.title}
                audience={describeAudience({
                  audience: row.audience, levelId: row.level_id, trackId: row.track_id,
                  groupIds: row.assignment_audience_groups.map((group) => group.group_id),
                }, names)}
                state={row.state}
                maxScore={row.max_score}
                parts={row.assignment_parts}
                students={number.format(row.recipient_count)}
                dueAt={row.due_at}
              />
            ))}
          </div>
          {pageCount > 1 && (
            <nav aria-label="Assignment pages" className="flex items-center justify-end gap-2 text-sm">
              <span className="tabular-nums text-muted-foreground">Page {page + 1} of {pageCount}</span>
              <Button variant="outline" size="icon-sm" aria-label="Previous page" disabled={page === 0 || listQuery.isFetching} onClick={() => setPage(page - 1)}><IconChevronLeft /></Button>
              <Button variant="outline" size="icon-sm" aria-label="Next page" disabled={page >= pageCount - 1 || listQuery.isFetching} onClick={() => setPage(page + 1)}><IconChevronRight /></Button>
            </nav>
          )}
        </div>
      ))}
    </main>
  );
}
