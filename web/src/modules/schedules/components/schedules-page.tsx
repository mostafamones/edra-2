"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CalendarClock, ChevronDown, Plus, SearchX } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { AcademyGate, useAuth } from "@/modules/auth";
import type { AcademyEntry } from "@/modules/academies";
import { groupListQueryKey, loadGroups, loadStructure, structureQueryKey } from "@/modules/groups";
import {
  audienceDetails, buildAudienceLookup, DEFAULT_FILTERS, deriveScheduleList, isFiltering, type ScheduleFilters, type SessionRow,
} from "../derive";
import { canArchiveSchedule, canEditSchedule } from "../permissions";
import { loadSchedules, scheduleListQueryKey, type Schedule, type ScheduleSession, type ScheduleSlot } from "../queries";
import { weekdayName } from "../time";
import { ArchiveDialog } from "./archive-dialog";
import { DaySection } from "./day-section";
import { ScheduleEditSheet } from "./edit-sheet";
import { ScheduleRow } from "./row";
import { SchedulesToolbar } from "./toolbar";

export function SchedulesPage() {
  // The gate re-mounts the content per academy, which resets filters, the sheet, and dialogs.
  return <AcademyGate>{(academy) => <SchedulesContent academy={academy} />}</AcademyGate>;
}

/** Re-renders every minute so one-offs move to Past once they end. */
function useMinuteClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function SchedulesContent({ academy }: { academy: AcademyEntry }) {
  const academyId = academy.id;
  const { user } = useAuth();
  const now = useMinuteClock();
  const [archived, setArchived] = useState(false);
  const [filters, setFilters] = useState<ScheduleFilters>(DEFAULT_FILTERS);
  const [editing, setEditing] = useState<{ schedule: Schedule; slots: ScheduleSlot[]; sessions: ScheduleSession[] } | null>(null);
  const [archiving, setArchiving] = useState<Schedule | null>(null);

  const schedulesQuery = useQuery({
    queryKey: scheduleListQueryKey(academyId, archived),
    queryFn: () => loadSchedules(academyId, { archived }),
  });
  const structureQuery = useQuery({ queryKey: structureQueryKey(academyId), queryFn: () => loadStructure(academyId) });
  // Audience labels need archived groups too: an archived schedule may point at an archived group.
  const activeGroupsQuery = useQuery({ queryKey: groupListQueryKey(academyId, false), queryFn: () => loadGroups(academyId) });
  const archivedGroupsQuery = useQuery({
    queryKey: groupListQueryKey(academyId, true),
    queryFn: () => loadGroups(academyId, { archived: true }),
  });
  const queries = [schedulesQuery, structureQuery, activeGroupsQuery, archivedGroupsQuery];
  const failed = queries.some((query) => query.isError);
  const retrying = queries.some((query) => query.isFetching);
  const retry = () => { for (const query of queries) if (query.isError) void query.refetch(); };

  const data = schedulesQuery.data && structureQuery.data && activeGroupsQuery.data && archivedGroupsQuery.data
    ? {
      ...schedulesQuery.data,
      ...structureQuery.data,
      lookup: buildAudienceLookup({
        groups: [...activeGroupsQuery.data.groups, ...archivedGroupsQuery.data.groups],
        tracks: structureQuery.data.tracks,
        levelNames: structureQuery.data.levelNames,
      }),
    }
    : undefined;
  const list = data ? deriveScheduleList(data.schedules, data.slots, data.sessions, data.lookup, filters, now) : undefined;

  function actionsFor(schedule: Schedule) {
    return {
      onEdit: canEditSchedule(academy.role, schedule)
        ? () => setEditing({
          schedule,
          slots: data?.slots.filter((slot) => slot.schedule_id === schedule.id) ?? [],
          sessions: data?.sessions.filter((session) => session.schedule_id === schedule.id) ?? [],
        })
        : undefined,
      onArchive: canArchiveSchedule(academy.role, schedule, user?.id) ? () => setArchiving(schedule) : undefined,
    };
  }

  function oneOffRow({ schedule, session, sessionCount }: SessionRow) {
    return (
      <ScheduleRow
        key={session.id}
        schedule={schedule}
        date={session.occurs_on}
        startsAt={session.starts_at}
        sessionCount={sessionCount}
        {...audienceDetails(schedule, data!.lookup)}
        {...actionsFor(schedule)}
      />
    );
  }

  return (
    <main className="page-shell">
      <h1 className="font-heading text-2xl font-bold tracking-tight">Schedules</h1>

      <SchedulesToolbar
        filters={filters}
        onFiltersChange={setFilters}
        archived={archived}
        onArchivedChange={setArchived}
        levels={structureQuery.data?.levels ?? []}
        levelNames={structureQuery.data?.levelNames ?? {}}
      />

      {failed && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>{data ? "Couldn’t refresh schedules" : "Couldn’t load schedules"}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            {data ? "Showing the last loaded schedules." : "Check your connection and try again."}
            <Button variant="outline" size="sm" onClick={retry} disabled={retrying}>{retrying ? "Retrying…" : "Retry"}</Button>
          </AlertDescription>
        </Alert>
      )}

      {!data && !failed && (
        <div role="status" aria-label="Loading schedules" className="flex flex-col gap-6">
          {[3, 2].map((rows, section) => (
            <div key={section} aria-hidden="true" className="flex flex-col gap-2">
              <Skeleton className="h-4 w-24" />
              {Array.from({ length: rows }, (_, index) => <Skeleton key={index} className="h-16 rounded-xl" />)}
            </div>
          ))}
        </div>
      )}

      {data && !data.year && (
        <Alert>
          <AlertCircle />
          <AlertTitle>No active academic year</AlertTitle>
          <AlertDescription>Schedules belong to an academic year. Open one for this academy to start scheduling classes.</AlertDescription>
        </Alert>
      )}

      {data?.year && list && (data.schedules.length === 0 ? (
        <Empty className="min-h-64 rounded-xl border border-dashed border-border bg-card/20 py-20">
          <EmptyHeader className="gap-1">
            <EmptyMedia variant="icon"><CalendarClock aria-hidden="true" /></EmptyMedia>
            <EmptyTitle className="text-xl font-semibold">{archived ? "No archived schedules" : "No schedules yet"}</EmptyTitle>
            <EmptyDescription className="leading-[1.4em]">
              {archived
                ? "Schedules you archive this academic year will appear here."
                : "Create a weekly class or a one-off session to plan when students meet."}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="w-full flex-row justify-center gap-2">
            {archived
              ? <Button size="sm" variant="outline" onClick={() => setArchived(false)}>View active schedules</Button>
              : <Button size="sm" asChild><Link href="/app/schedules/new"><Plus />Create schedule</Link></Button>}
          </EmptyContent>
        </Empty>
      ) : list.matched === 0 ? (
        <Empty className="min-h-48 rounded-xl border border-dashed border-border py-14">
          <EmptyHeader className="gap-1">
            <EmptyMedia variant="icon"><SearchX aria-hidden="true" /></EmptyMedia>
            <EmptyTitle>No matching schedules</EmptyTitle>
            <EmptyDescription>Try a different search, or clear the filters to see every schedule.</EmptyDescription>
          </EmptyHeader>
          {isFiltering(filters) && (
            <EmptyContent><Button size="sm" variant="outline" onClick={() => setFilters(DEFAULT_FILTERS)}>Clear filters</Button></EmptyContent>
          )}
        </Empty>
      ) : (
        <div className="flex flex-col gap-7">
          {list.weekdays.map((section) => (
            <DaySection key={section.weekday} title={weekdayName(section.weekday)} count={section.rows.length}>
              {section.rows.map((row) => (
                <ScheduleRow
                  key={row.slot.id}
                  schedule={row.schedule}
                  startsAt={row.slot.starts_at}
                  slotCount={row.slotCount}
                  {...audienceDetails(row.schedule, data.lookup)}
                  {...actionsFor(row.schedule)}
                />
              ))}
            </DaySection>
          ))}

          {list.upcoming.length > 0 && (
            <DaySection title="One-offs" count={list.upcoming.length}>{list.upcoming.map(oneOffRow)}</DaySection>
          )}

          {list.past.length > 0 && (
            <Collapsible defaultOpen={false} className="group/past">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
                  <ChevronDown className="transition-transform group-data-[state=open]/past:rotate-180" aria-hidden="true" />
                  Past one-offs ({list.past.length})
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2.5 grid gap-2">{list.past.map(oneOffRow)}</CollapsibleContent>
            </Collapsible>
          )}
        </div>
      ))}

      <ScheduleEditSheet academy={academy} editing={editing} onClose={() => setEditing(null)} />
      <ArchiveDialog academyId={academyId} schedule={archiving} onClose={() => setArchiving(null)} />
    </main>
  );
}
