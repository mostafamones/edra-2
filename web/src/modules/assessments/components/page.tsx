"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircleIcon, AssignmentsIcon, SearchRemoveIcon } from "@hugeicons/core-free-icons";

import { rememberAssessmentList } from "@/components/shared/assessment/list/return";
import { describeAudience, useAudienceNames } from "@/components/shared/assessment/workspace/names";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import type { AcademyEntry } from "@/modules/academies";
import { loadYears } from "@/modules/assignments";
import { AcademyGate, useAuth } from "@/modules/auth";
import { useCanonicalHref } from "@/modules/navigation";
import { ALL, DEFAULT_PARAMS, sameStatuses } from "../params";
import { assessmentListQueryKey, assessmentsRootKey, loadAssessments, type ListFilters } from "../queries";
import { DEFAULT_STATUSES, TYPE_ROUTES, type AssessmentListItem, type AssessmentRow } from "../types";
import { useAssessmentParams } from "../use-params";
import { useAssessmentView } from "../view";
import { AssessmentCards } from "./cards";
import { CreateAssessment } from "./create";
import { groupRows } from "./groups";
import { AssessmentTable } from "./table";
import { AssessmentToolbar } from "./toolbar";
import { AssessmentPagination } from "./pagination";
import { QuickEditSheet } from "./quick-edit";

/** `/app/assessments`: every assignment, quiz and exam in the academy, as a table or cards. */
export function AssessmentsPage() {
  // The gate re-mounts the content per academy; switching academies also drops the URL state.
  return (
    <AcademyGate>
      {(academy) => (
        <Suspense fallback={<main className="page-shell"><Skeleton className="h-8 w-48" /></main>}>
          <ListContent academy={academy} />
        </Suspense>
      )}
    </AcademyGate>
  );
}

function ListContent({ academy }: { academy: AcademyEntry }) {
  const href = useCanonicalHref();
  const { user } = useAuth();
  const academyId = academy.id;
  const [params, update, query] = useAssessmentParams();
  const [view, setView] = useAssessmentView(user?.id);
  const [editing, setEditing] = useState<{ item: AssessmentListItem; opener: HTMLElement | null } | null>(null);
  const edit = (item: AssessmentListItem, opener: HTMLElement | null) => setEditing({ item, opener });
  const names = useAudienceNames(academyId);
  useEffect(() => { rememberAssessmentList(academy.slug, query); }, [academy.slug, query]);

  const yearsQuery = useQuery({ queryKey: [...assessmentsRootKey(academyId), "years"], queryFn: () => loadYears(academyId) });
  // Only the active year is listed; an academy without one shows every year.
  const year = yearsQuery.data?.find((option) => option.open)?.id ?? ALL;
  const filters: ListFilters = {
    type: params.type, search: params.search, year, audience: params.audience, level: params.level, track: params.track, groupId: params.groupId,
    statuses: params.statuses, sort: params.sort, group: params.group, pageSize: params.pageSize,
  };
  const listQuery = useQuery({
    queryKey: assessmentListQueryKey(academyId, filters, params.page),
    queryFn: () => loadAssessments(academyId, filters, params.page),
    enabled: yearsQuery.isSuccess,
    placeholderData: keepPreviousData,
    // Assessment edits happen on other pages; read fresh whenever the list opens.
    staleTime: 0,
  });

  // Previous results for other filters are never shown as the answer to a failed request.
  const data = listQuery.isError && listQuery.isPlaceholderData ? undefined : listQuery.data;
  const failed = yearsQuery.isError || listQuery.isError;
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / params.pageSize));
  const filtering = params.type !== ALL || params.search.trim() !== "" || params.audience !== ALL || params.level !== null
    || !sameStatuses(params.statuses, DEFAULT_STATUSES);

  // A hand-edited page past the end goes to the last page.
  useEffect(() => {
    if (data && !listQuery.isPlaceholderData && data.items.length === 0 && params.page > 0) update({ page: pageCount - 1 });
  }, [data, listQuery.isPlaceholderData, params.page, pageCount, update]);

  const rows = useMemo<AssessmentRow[]>(() => (data?.items ?? []).map((item) => ({
    item,
    href: href(`/app/${TYPE_ROUTES[item.type]}/${item.id}`),
    audience: describeAudience(item, names),
  })), [data, href, names]);
  const groups = useMemo(() => groupRows(rows, params.group), [rows, params.group]);
  // Collapsed groups, shared by both views.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const toggleGroup = (key: string) => setCollapsed((current) => {
    const next = new Set(current);
    if (!next.delete(key)) next.add(key);
    return next;
  });

  return (
    <main className="page-shell">
      {/* The header breadcrumb shows the page name; the heading stays for screen readers. */}
      <h1 className="sr-only">Assessments</h1>

      <AssessmentToolbar params={params} onChange={update} view={view} onView={setView} academyId={academyId} />

      {failed && (
        <Alert variant="destructive">
          <HugeiconsIcon icon={AlertCircleIcon} strokeWidth={1.5} aria-hidden="true" />
          <AlertTitle>{data ? "Couldn’t refresh assessments" : "Couldn’t load assessments"}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            {data ? "Showing the last loaded assessments." : "Check your connection and try again."}
            <Button variant="outline" size="sm" disabled={listQuery.isFetching || yearsQuery.isFetching}
              onClick={() => { if (yearsQuery.isError) void yearsQuery.refetch(); else void listQuery.refetch(); }}>Retry</Button>
          </AlertDescription>
        </Alert>
      )}

      {!data && !failed && (
        <div role="status" aria-label="Loading assessments" className="flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-12 rounded-lg" />)}
        </div>
      )}

      {data && (data.total === 0 ? (
        filtering ? (
          <Empty className="min-h-48 rounded-xl border border-dashed border-border py-14">
            <EmptyHeader className="gap-1">
              <EmptyMedia variant="icon"><HugeiconsIcon icon={SearchRemoveIcon} strokeWidth={1.5} aria-hidden="true" /></EmptyMedia>
              <EmptyTitle>No matching assessments</EmptyTitle>
            </EmptyHeader>
            <EmptyContent><Button size="sm" variant="outline" onClick={() => update(DEFAULT_PARAMS)}>Clear filters</Button></EmptyContent>
          </Empty>
        ) : (
          <Empty className="min-h-64 rounded-xl border border-dashed border-border bg-card/20 py-20">
            <EmptyHeader className="gap-1">
              <EmptyMedia variant="icon"><HugeiconsIcon icon={AssignmentsIcon} strokeWidth={1.5} aria-hidden="true" /></EmptyMedia>
              <EmptyTitle className="text-xl font-semibold">No assessments yet</EmptyTitle>
            </EmptyHeader>
            <EmptyContent><CreateAssessment size="sm" /></EmptyContent>
          </Empty>
        )
      ) : (
        <div className="flex flex-col gap-3" aria-busy={listQuery.isFetching}>
          {view === "table"
            ? <AssessmentTable groups={groups} collapsed={collapsed} onToggle={toggleGroup} onEdit={edit} />
            : <AssessmentCards groups={groups} collapsed={collapsed} onToggle={toggleGroup} onEdit={edit} />}
          <AssessmentPagination params={params} total={data.total} disabled={listQuery.isFetching || listQuery.isPlaceholderData} onChange={update} />
        </div>
      ))}
      {editing && <QuickEditSheet academy={academy} item={editing.item} opener={editing.opener} onClose={() => setEditing(null)} />}
    </main>
  );
}
