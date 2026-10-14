"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { IconAlertCircle, IconClock, IconPencil, IconUsersGroup } from "@tabler/icons-react";

import { useBreadcrumbTitle } from "@/components/shared/breadcrumb-title";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatScore } from "@/lib/score";
import type { AcademyEntry } from "@/modules/academies";
import { AcademyGate } from "@/modules/auth";
import { useCanonicalHref } from "@/modules/navigation";
import { quizPermissions } from "../../permissions";
import { loadQuiz, quizQueryKey } from "../../queries";
import type { Quiz } from "../../types";
import { describeAudience, ISSUE_LABELS, PHASE_BADGE, PHASE_HINTS, PHASE_LABELS } from "../shared/labels";
import { QuizNotFound } from "../shared/not-found";
import { useAudienceNames } from "../shared/use-names";
import { QuizStudents } from "../students/list";
import { ArchiveQuiz } from "./archive";
import { AvailabilityDialog } from "./availability";
import { QuizOverview } from "./overview";

/**
 * `/app/quizzes/<id>`: one workspace for a quiz: a header (title, phase, audience, timer, actions),
 * then an Overview tab (window, counts, questions and key, corrections) and a Students tab (roster
 * and historical participants, physical entry, marking, announcement and result history).
 */
export function QuizWorkspace({ id }: { id: string }) {
  return <AcademyGate>{(academy) => <WorkspaceContent academy={academy} quizId={id} />}</AcademyGate>;
}

function WorkspaceContent({ academy, quizId }: { academy: AcademyEntry; quizId: string }) {
  // Phases move with time; refreshing also lets due deadlines settle on read.
  const query = useQuery({ queryKey: quizQueryKey(academy.id, quizId), queryFn: () => loadQuiz(academy.id, quizId), refetchInterval: 30_000 });
  useBreadcrumbTitle(query.data?.title ?? "Quiz");
  return (
    <main className="page-shell">
      {query.isPending && (
        <div role="status" aria-label="Loading quiz" className="flex flex-col gap-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-40 rounded-xl" /></div>
      )}
      {query.isError && (
        <Alert variant="destructive">
          <IconAlertCircle />
          <AlertTitle>{query.data ? "Couldn’t refresh this quiz" : "Couldn’t load this quiz"}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            {query.data ? "Showing the last loaded details." : "Check your connection and try again."}
            <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>Retry</Button>
          </AlertDescription>
        </Alert>
      )}
      {query.data === null && <QuizNotFound />}
      {query.data && <Workspace academy={academy} quiz={query.data} />}
    </main>
  );
}

type View = "overview" | "students";

function Workspace({ academy, quiz }: { academy: AcademyEntry; quiz: Quiz }) {
  const href = useCanonicalHref();
  const names = useAudienceNames(academy.id);
  const [view, setView] = useState<View>("overview");
  const permissions = quizPermissions(academy.role, quiz);

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-heading text-2xl font-bold tracking-tight break-words">{quiz.title}</h1>
            <Tooltip>
              <TooltipTrigger asChild><Badge variant={PHASE_BADGE[quiz.phase]} tabIndex={0}>{PHASE_LABELS[quiz.phase]}</Badge></TooltipTrigger>
              <TooltipContent className="max-w-72">{PHASE_HINTS[quiz.phase]}</TooltipContent>
            </Tooltip>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5"><IconUsersGroup className="size-4" aria-hidden="true" />{describeAudience(quiz, names)}</span>
            <span className="flex items-center gap-1.5"><IconClock className="size-4" aria-hidden="true" />{quiz.timeLimitMinutes ? `${quiz.timeLimitMinutes} min timer` : "Untimed"}</span>
            <span className="tabular-nums">
              {formatScore(quiz.effectiveMaxScore)} marks{quiz.effectiveMaxScore !== quiz.maxScore ? ` (of ${formatScore(quiz.maxScore)} authored)` : ""}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {permissions.edit && <Button variant="outline" asChild><Link href={href(`/app/quizzes/${quiz.id}/edit`)}><IconPencil />Edit</Link></Button>}
          {permissions.availability && <AvailabilityDialog key={quiz.version} quiz={quiz} />}
          {permissions.archive && <ArchiveQuiz quiz={quiz} />}
        </div>
      </header>

      {!quiz.yearOpen && (
        <Alert><IconAlertCircle /><AlertTitle>Read-only</AlertTitle><AlertDescription>This quiz belongs to a closed academic year.</AlertDescription></Alert>
      )}
      {quiz.yearOpen && quiz.archivedAt === null && !quiz.ready && (
        <Alert>
          <IconAlertCircle />
          <AlertTitle>Setup isn’t finished</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">{[...new Set(quiz.issues.map((issue) => ISSUE_LABELS[issue.issue]))].map((label) => <li key={label}>{label}.</li>)}</ul>
          </AlertDescription>
        </Alert>
      )}
      <Alert>
        <IconAlertCircle />
        <AlertTitle>Online answering isn’t connected yet</AlertTitle>
        <AlertDescription>
          Students can’t open quizzes online until student accounts are linked to their academy records and the quiz is attached to released content. Physical entry, marking and announcement work now.
        </AlertDescription>
      </Alert>

      <Tabs value={view} onValueChange={(value) => setView(value as View)} className="gap-6">
        <TabsList variant="line" className="w-full justify-start border-b pb-[5px]">
          <TabsTrigger value="overview" className="flex-none px-3">Overview</TabsTrigger>
          <TabsTrigger value="students" className="flex-none px-3">
            Students<span className="text-xs text-muted-foreground tabular-nums">{quiz.counts.submitted}/{quiz.counts.eligible}</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview"><QuizOverview quiz={quiz} permissions={permissions} /></TabsContent>
        <TabsContent value="students"><QuizStudents academy={academy} quiz={quiz} permissions={permissions} /></TabsContent>
      </Tabs>
    </>
  );
}
