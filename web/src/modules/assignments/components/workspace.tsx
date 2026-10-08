"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { IconAlertCircle, IconCalendarDue, IconPencil, IconUsersGroup } from "@tabler/icons-react";

import { useBreadcrumbTitle } from "@/components/shared/breadcrumb-title";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AcademyEntry } from "@/modules/academies";
import { AcademyGate } from "@/modules/auth";
import { groupListQueryKey, loadGroups, loadStructure, structureQueryKey } from "@/modules/groups";
import { useCanonicalHref } from "@/modules/navigation";
import type { MarkFocus } from "../focus";
import { assignmentPermissions } from "../permissions";
import { assignmentQueryKey, loadAssignment } from "../queries";
import type { Assignment } from "../types";
import { formatAcademyDateTime } from "../due";
import { AUDIENCE_LABELS, describeAudience, STATE_BADGE, STATE_LABELS } from "./labels";
import { LifecycleActions } from "./lifecycle";
import { MarkingSheet } from "./marking";
import { NotFound } from "./not-found";
import { AssignmentOverview } from "./overview";
import { AssignmentStudents } from "./students";

/**
 * `/app/assignments/<id>`: one workspace for an assignment: a header (title, state, audience, due date,
 * actions), then an Overview tab (stats, marks chart, parts, top students) and a Students tab (the full
 * student list with result publication). Student submissions join it as a later slice.
 */
export function AssignmentWorkspace({ id }: { id: string }) {
  return <AcademyGate>{(academy) => <WorkspaceContent academy={academy} assignmentId={id} />}</AcademyGate>;
}

function WorkspaceContent({ academy, assignmentId }: { academy: AcademyEntry; assignmentId: string }) {
  const query = useQuery({ queryKey: assignmentQueryKey(academy.id, assignmentId), queryFn: () => loadAssignment(academy.id, assignmentId) });
  useBreadcrumbTitle(query.data?.title ?? "Assignment");

  return (
    <main className="page-shell">
      {query.isPending && (
        <div role="status" aria-label="Loading assignment" className="flex flex-col gap-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      )}
      {query.isError && (
        <Alert variant="destructive">
          <IconAlertCircle />
          <AlertTitle>{query.data ? "Couldn’t refresh this assignment" : "Couldn’t load this assignment"}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            {query.data ? "Showing the last loaded details." : "Check your connection and try again."}
            <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>Retry</Button>
          </AlertDescription>
        </Alert>
      )}
      {query.data === null && <NotFound />}
      {query.data && <Workspace academy={academy} assignment={query.data} />}
    </main>
  );
}

type View = "overview" | "students";

function Workspace({ academy, assignment }: { academy: AcademyEntry; assignment: Assignment }) {
  const href = useCanonicalHref();
  const [view, setView] = useState<View>("overview");
  const [focus, setFocus] = useState<MarkFocus | null>(null);
  const permissions = assignmentPermissions(academy.role, assignment);
  const structureQuery = useQuery({ queryKey: structureQueryKey(academy.id), queryFn: () => loadStructure(academy.id) });
  const activeGroupsQuery = useQuery({ queryKey: groupListQueryKey(academy.id, false), queryFn: () => loadGroups(academy.id) });
  const archivedGroupsQuery = useQuery({ queryKey: groupListQueryKey(academy.id, true), queryFn: () => loadGroups(academy.id, { archived: true }) });
  const names = useMemo(() => ({
    levelNames: structureQuery.data?.levelNames ?? {},
    trackNames: new Map((structureQuery.data?.tracks ?? []).map((track) => [track.id, track.name])),
    groupNames: new Map([...(activeGroupsQuery.data?.groups ?? []), ...(archivedGroupsQuery.data?.groups ?? [])].map((group) => [group.id, group.name])),
  }), [structureQuery.data, activeGroupsQuery.data, archivedGroupsQuery.data]);

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-heading text-2xl font-bold tracking-tight break-words">{assignment.title}</h1>
            <Badge variant={STATE_BADGE[assignment.state]}>{STATE_LABELS[assignment.state]}</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <IconUsersGroup className="size-4" aria-hidden="true" />
              {describeAudience(assignment, names)}<span className="text-muted-foreground/70">· {AUDIENCE_LABELS[assignment.audience]}</span>
            </span>
            {assignment.dueAt ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex cursor-default items-center gap-1.5">
                    <IconCalendarDue className="size-4" aria-hidden="true" />Due {formatAcademyDateTime(assignment.dueAt)}
                  </span>
                </TooltipTrigger>
                <TooltipContent>Advisory only: nothing closes or is rejected when it passes.</TooltipContent>
              </Tooltip>
            ) : (
              <span className="flex items-center gap-1.5"><IconCalendarDue className="size-4" aria-hidden="true" />No due date</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {permissions.mark && <MarkingSheet assignment={assignment} />}
          {permissions.edit && (
            <Button variant="outline" asChild><Link href={href(`/app/assignments/${assignment.id}/edit`)}><IconPencil />Edit</Link></Button>
          )}
          <LifecycleActions assignment={assignment} permissions={permissions} />
        </div>
      </header>

      {!assignment.yearOpen && (
        <Alert>
          <IconAlertCircle />
          <AlertTitle>Read-only</AlertTitle>
          <AlertDescription>This assignment belongs to a closed academic year.</AlertDescription>
        </Alert>
      )}
      {assignment.state === "draft" && academy.role === "instructor" && (
        <Alert>
          <IconAlertCircle />
          <AlertTitle>Draft</AlertTitle>
          <AlertDescription>An Owner or Admin publishes it to students when it’s ready.</AlertDescription>
        </Alert>
      )}

      <Tabs value={view} onValueChange={(value) => setView(value as View)} className="gap-6">
        <TabsList variant="line" className="w-full justify-start border-b pb-[5px]">
          <TabsTrigger value="overview" className="flex-none px-3">Overview</TabsTrigger>
          <TabsTrigger value="students" className="flex-none px-3">
            Students
            {assignment.state !== "draft" && <span className="text-xs text-muted-foreground tabular-nums">{assignment.recipientCount}</span>}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <AssignmentOverview assignment={assignment} onViewStudents={() => setView("students")}
            onSelectBar={(target) => { setFocus({ ...target, outcome: "lost" }); setView("students"); }} />
        </TabsContent>
        <TabsContent value="students">
          <AssignmentStudents academy={academy} assignment={assignment} focus={focus} onFocusChange={setFocus} />
        </TabsContent>
      </Tabs>
    </>
  );
}
