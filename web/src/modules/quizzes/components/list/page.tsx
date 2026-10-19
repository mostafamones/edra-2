"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  IconAlertCircle, IconChevronLeft, IconChevronRight, IconListCheck, IconPlus, IconSearch, IconSearchOff,
} from "@tabler/icons-react";

import { AssessmentCard } from "@/components/shared/assessment/list/card";
import { FilterPopover } from "@/components/shared/filter-popover";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { formatScore } from "@/lib/score";
import type { AcademyEntry } from "@/modules/academies";
import { AcademyGate } from "@/modules/auth";
import { useCanonicalHref } from "@/modules/navigation";
import {
  ALL, DEFAULT_QUIZ_FILTERS, loadQuizYears, loadQuizzes, QUIZ_PAGE_SIZE, quizListQueryKey, quizYearsQueryKey, type QuizListFilters,
} from "../../queries";
import { QUIZ_AUDIENCES, QUIZ_PHASES } from "../../types";
import { AUDIENCE_LABELS, PHASE_BADGE, PHASE_LABELS } from "../shared/labels";
import { QuizTime } from "../shared/time";
import { describeAudience, useAudienceNames } from "@/components/shared/assessment/workspace/names";

/** `/app/quizzes`: every quiz in the academy, searchable and filterable by year, phase and audience. */
export function QuizzesPage() {
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
  const academyId = academy.id;
  const names = useAudienceNames(academyId);
  const yearsQuery = useQuery({ queryKey: quizYearsQueryKey(academyId), queryFn: () => loadQuizYears(academyId) });
  const openYear = yearsQuery.data?.find((year) => year.open)?.id;
  const [chosen, setChosen] = useState<Omit<QuizListFilters, "yearId"> & { yearId?: string }>(DEFAULT_QUIZ_FILTERS);
  const filters: QuizListFilters = { ...chosen, yearId: chosen.yearId ?? openYear ?? ALL };
  const search = useDebounced(filters.search, 250);
  const applied = { ...filters, search };
  const [page, setPage] = useState(0);
  const filtering = filters.search.trim() !== "" || filters.phase !== DEFAULT_QUIZ_FILTERS.phase || filters.audience !== ALL
    || (chosen.yearId !== undefined && chosen.yearId !== openYear);

  const listQuery = useQuery({
    queryKey: quizListQueryKey(academyId, applied, page),
    queryFn: () => loadQuizzes(academyId, applied, page),
    enabled: yearsQuery.isSuccess,
    placeholderData: keepPreviousData,
  });

  const set = (change: Partial<QuizListFilters>) => { setChosen((current) => ({ ...current, ...change })); setPage(0); };
  const clear = () => { setChosen(DEFAULT_QUIZ_FILTERS); setPage(0); };
  const failed = yearsQuery.isError || listQuery.isError;
  const data = listQuery.data;
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / QUIZ_PAGE_SIZE));

  return (
    <main className="page-shell">
      <h1 className="font-heading text-2xl font-bold tracking-tight">Quizzes</h1>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <InputGroup className="sm:max-w-sm">
          <InputGroupInput type="search" placeholder="Search quizzes" aria-label="Search quizzes" value={filters.search}
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
              id: "phase", label: "Status", value: filters.phase, defaultValue: DEFAULT_QUIZ_FILTERS.phase,
              options: [
                { value: "current", label: "All but archived" }, { value: ALL, label: "All statuses" },
                ...QUIZ_PHASES.map((phase) => ({ value: phase, label: PHASE_LABELS[phase] })),
              ],
              onChange: (phase) => set({ phase: phase as QuizListFilters["phase"] }),
            },
            {
              id: "audience", label: "Audience", value: filters.audience, defaultValue: ALL,
              options: [{ value: ALL, label: "All audiences" }, ...QUIZ_AUDIENCES.map((audience) => ({ value: audience, label: AUDIENCE_LABELS[audience] }))],
              onChange: (audience) => set({ audience: audience as QuizListFilters["audience"] }),
            },
          ]} />
          <Button asChild className="flex-1 sm:flex-none"><Link href={href("/app/quizzes/new")}><IconPlus />Create quiz</Link></Button>
        </div>
      </div>

      {failed && (
        <Alert variant="destructive">
          <IconAlertCircle />
          <AlertTitle>{data ? "Couldn’t refresh quizzes" : "Couldn’t load quizzes"}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            {data ? "Showing the last loaded quizzes." : "Check your connection and try again."}
            <Button variant="outline" size="sm" disabled={listQuery.isFetching || yearsQuery.isFetching}
              onClick={() => { if (yearsQuery.isError) void yearsQuery.refetch(); else void listQuery.refetch(); }}>Retry</Button>
          </AlertDescription>
        </Alert>
      )}

      {!data && !failed && (
        <div role="status" aria-label="Loading quizzes" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-32 rounded-lg" />)}
        </div>
      )}

      {data && (data.total === 0 ? (filtering ? (
        <Empty className="min-h-48 rounded-xl border border-dashed border-border py-14">
          <EmptyHeader className="gap-1">
            <EmptyMedia variant="icon"><IconSearchOff aria-hidden="true" /></EmptyMedia>
            <EmptyTitle>No matching quizzes</EmptyTitle>
            <EmptyDescription>Try a different search, or clear the filters to see every quiz.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent><Button size="sm" variant="outline" onClick={clear}>Clear filters</Button></EmptyContent>
        </Empty>
      ) : (
        <Empty className="min-h-64 rounded-xl border border-dashed border-border bg-card/20 py-20">
          <EmptyHeader className="gap-1">
            <EmptyMedia variant="icon"><IconListCheck aria-hidden="true" /></EmptyMedia>
            <EmptyTitle className="text-xl font-semibold">No quizzes yet</EmptyTitle>
            <EmptyDescription className="leading-[1.4em]">
              Prepare a quiz for a level, track or groups, open it for a window, enter physical work, then mark and announce results.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent><Button size="sm" asChild><Link href={href("/app/quizzes/new")}><IconPlus />Create quiz</Link></Button></EmptyContent>
        </Empty>
      )) : (
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.quizzes.map((quiz) => (
              <AssessmentCard
                key={quiz.id} href={href(`/app/quizzes/${quiz.id}`)} title={quiz.title}
                meta={`${describeAudience(quiz, names)} · ${formatScore(quiz.effectiveMaxScore)} marks${quiz.timeLimitMinutes ? ` · ${quiz.timeLimitMinutes} min` : ""}`}
                badge={(
                  <div className="flex flex-col items-end gap-0.5">
                    <Badge variant={PHASE_BADGE[quiz.phase]}>{PHASE_LABELS[quiz.phase]}</Badge>
                    {quiz.processingPending && <span className="text-xs text-muted-foreground">Processing closure</span>}
                  </div>
                )}
                questions={quiz.questionCount} submitted={quiz.submitted} answering={quiz.inProgress} announced={quiz.announced}
                window={quiz.opensAt ? { opens: <QuizTime value={quiz.opensAt} />, closes: <QuizTime value={quiz.closesAt} /> } : null}
              />
            ))}
          </div>
          {pageCount > 1 && (
            <nav aria-label="Quiz pages" className="flex items-center justify-end gap-2 text-sm">
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
