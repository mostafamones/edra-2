"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  IconAlertCircle, IconChevronLeft, IconChevronRight, IconFileText, IconPlus, IconSearch, IconSearchOff,
} from "@tabler/icons-react";

import { FilterPopover } from "@/components/shared/filter-popover";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatScore } from "@/lib/score";
import type { AcademyEntry } from "@/modules/academies";
import { AcademyGate } from "@/modules/auth";
import { useCanonicalHref } from "@/modules/navigation";
import {
  ALL, DEFAULT_EXAM_FILTERS, loadExamYears, loadExams, EXAM_PAGE_SIZE, examListQueryKey, examYearsQueryKey, type ExamListFilters,
} from "../../queries";
import { EXAM_AUDIENCES, EXAM_PHASES } from "../../types";
import { AUDIENCE_LABELS, describeAudience, PHASE_BADGE, PHASE_LABELS } from "../shared/labels";
import { ExamTime } from "../shared/time";
import { useAudienceNames } from "../shared/use-names";

/** `/app/exams`: every exam in the academy, searchable and filterable by year, phase and audience. */
export function ExamsPage() {
  // The gate re-mounts the content per academy, which resets filters and paging.
  return <AcademyGate>{(academy) => <ListContent academy={academy} />}</AcademyGate>;
}

function useDebounced<T>(value: T, delay: number) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

const yearLabel = (startYear: number) => `${startYear}–${String(startYear + 1).slice(-2)}`;

function ListContent({ academy }: { academy: AcademyEntry }) {
  const href = useCanonicalHref();
  const router = useRouter();
  const academyId = academy.id;
  const names = useAudienceNames(academyId);
  const yearsQuery = useQuery({ queryKey: examYearsQueryKey(academyId), queryFn: () => loadExamYears(academyId) });
  const openYear = yearsQuery.data?.find((year) => year.open)?.id;
  const [chosen, setChosen] = useState<Omit<ExamListFilters, "yearId"> & { yearId?: string }>(DEFAULT_EXAM_FILTERS);
  const filters: ExamListFilters = { ...chosen, yearId: chosen.yearId ?? openYear ?? ALL };
  const search = useDebounced(filters.search, 250);
  const applied = { ...filters, search };
  const [page, setPage] = useState(0);
  const filtering = filters.search.trim() !== "" || filters.phase !== DEFAULT_EXAM_FILTERS.phase || filters.audience !== ALL
    || (chosen.yearId !== undefined && chosen.yearId !== openYear);

  const listQuery = useQuery({
    queryKey: examListQueryKey(academyId, applied, page),
    queryFn: () => loadExams(academyId, applied, page),
    enabled: yearsQuery.isSuccess,
    placeholderData: keepPreviousData,
  });

  const set = (change: Partial<ExamListFilters>) => { setChosen((current) => ({ ...current, ...change })); setPage(0); };
  const clear = () => { setChosen(DEFAULT_EXAM_FILTERS); setPage(0); };
  const failed = yearsQuery.isError || listQuery.isError;
  const data = listQuery.data;
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / EXAM_PAGE_SIZE));

  return (
    <main className="page-shell">
      <h1 className="font-heading text-2xl font-bold tracking-tight">Exams</h1>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <InputGroup className="sm:max-w-sm">
          <InputGroupInput type="search" placeholder="Search exams" aria-label="Search exams" value={filters.search}
            onChange={(event) => set({ search: event.target.value })} />
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
              id: "phase", label: "Status", value: filters.phase, defaultValue: DEFAULT_EXAM_FILTERS.phase,
              options: [
                { value: "current", label: "All but archived" }, { value: ALL, label: "All statuses" },
                ...EXAM_PHASES.map((phase) => ({ value: phase, label: PHASE_LABELS[phase] })),
              ],
              onChange: (phase) => set({ phase: phase as ExamListFilters["phase"] }),
            },
            {
              id: "audience", label: "Audience", value: filters.audience, defaultValue: ALL,
              options: [{ value: ALL, label: "All audiences" }, ...EXAM_AUDIENCES.map((audience) => ({ value: audience, label: AUDIENCE_LABELS[audience] }))],
              onChange: (audience) => set({ audience: audience as ExamListFilters["audience"] }),
            },
          ]} />
          <Button asChild className="flex-1 sm:flex-none"><Link href={href("/app/exams/new")}><IconPlus />Create exam</Link></Button>
        </div>
      </div>

      {failed && (
        <Alert variant="destructive">
          <IconAlertCircle />
          <AlertTitle>{data ? "Couldn’t refresh exams" : "Couldn’t load exams"}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            {data ? "Showing the last loaded exams." : "Check your connection and try again."}
            <Button variant="outline" size="sm" disabled={listQuery.isFetching || yearsQuery.isFetching}
              onClick={() => { if (yearsQuery.isError) void yearsQuery.refetch(); else void listQuery.refetch(); }}>Retry</Button>
          </AlertDescription>
        </Alert>
      )}

      {!data && !failed && (
        <div role="status" aria-label="Loading exams" className="flex flex-col gap-2">
          {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-12 rounded-lg" />)}
        </div>
      )}

      {data && (data.total === 0 ? (filtering ? (
        <Empty className="min-h-48 rounded-xl border border-dashed border-border py-14">
          <EmptyHeader className="gap-1">
            <EmptyMedia variant="icon"><IconSearchOff aria-hidden="true" /></EmptyMedia>
            <EmptyTitle>No matching exams</EmptyTitle>
            <EmptyDescription>Try a different search, or clear the filters to see every exam.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent><Button size="sm" variant="outline" onClick={clear}>Clear filters</Button></EmptyContent>
        </Empty>
      ) : (
        <Empty className="min-h-64 rounded-xl border border-dashed border-border bg-card/20 py-20">
          <EmptyHeader className="gap-1">
            <EmptyMedia variant="icon"><IconFileText aria-hidden="true" /></EmptyMedia>
            <EmptyTitle className="text-xl font-semibold">No exams yet</EmptyTitle>
            <EmptyDescription className="leading-[1.4em]">
              Prepare a timed exam for a level, track or groups, record physical work or open an online window, then mark and announce results.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent><Button size="sm" asChild><Link href={href("/app/exams/new")}><IconPlus />Create exam</Link></Button></EmptyContent>
        </Empty>
      )) : (
        <div className="flex flex-col gap-3">
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Exam</TableHead>
                  <TableHead className="w-32">Status</TableHead>
                  <TableHead className="w-56">Window</TableHead>
                  <TableHead className="w-28 text-right">Submitted</TableHead>
                  <TableHead className="w-28 text-right">Announced</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.exams.map((exam) => {
                  const link = href(`/app/exams/${exam.id}`);
                  return (
                    <TableRow key={exam.id} className="cursor-pointer" onClick={() => router.push(link)}>
                      <TableCell>
                        <Link href={link} className="font-medium outline-none hover:underline focus-visible:underline" onClick={(event) => event.stopPropagation()}>
                          {exam.title}
                        </Link>
                        <span className="block text-xs text-muted-foreground">
                          {describeAudience(exam, names)} · {exam.questionCount} question{exam.questionCount === 1 ? "" : "s"} · {formatScore(exam.effectiveMaxScore)} marks
                          {exam.timeLimitMinutes ? ` · ${exam.timeLimitMinutes} min` : ""}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={PHASE_BADGE[exam.phase]}>{PHASE_LABELS[exam.phase]}</Badge>
                        {exam.processingPending && <span className="mt-0.5 block text-xs text-muted-foreground">Processing closure</span>}
                      </TableCell>
                      <TableCell className="text-xs">
                        {exam.opensAt ? (
                          <span className="flex flex-col">
                            <span><span className="text-muted-foreground">Opens </span><ExamTime value={exam.opensAt} /></span>
                            <span><span className="text-muted-foreground">Closes </span><ExamTime value={exam.closesAt} /></span>
                          </span>
                        ) : <span className="text-muted-foreground">No online window</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {exam.submitted}
                        {exam.inProgress > 0 && <span className="block text-xs text-muted-foreground">{exam.inProgress} answering</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{exam.announced}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {pageCount > 1 && (
            <nav aria-label="Exam pages" className="flex items-center justify-end gap-2 text-sm">
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
