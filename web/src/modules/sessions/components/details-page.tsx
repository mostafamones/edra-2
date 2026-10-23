"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { IconAlertCircle, IconArchive, IconArchiveOff, IconArrowLeft, IconPlayerStop, IconQuestionMark } from "@tabler/icons-react";

import { useBreadcrumbTitle } from "@/components/shared/breadcrumb-title";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import type { AcademyEntry } from "@/modules/academies";
import { AcademyGate } from "@/modules/auth";
import { useCanonicalHref } from "@/modules/navigation";
import { fetchSession, SessionRequestError, sessionQueryKey } from "../queries";
import type { SessionDetail } from "../types";
import { ArchiveSessionDialog } from "./archive-dialog";
import { EndSessionDialog } from "./end-dialog";
import { SessionFacts } from "./facts";
import { formatDayMonth, formatMoment, startedByLabel } from "./format";

/** Refreshes so a session ended on another device stops looking live here. */
const DETAIL_REFRESH_MS = 30_000;

/** `/app/attendance/<id>`: the session's headline facts, with its attendance section underneath. */
export function SessionDetailsPage({ id, attendance, content }: { id: string; attendance: ReactNode; content?: ReactNode }) {
  return <AcademyGate>{(academy) => <DetailsContent academy={academy} sessionId={id} attendance={attendance} content={content} />}</AcademyGate>;
}

function DetailsContent({ academy, sessionId, attendance, content }: { academy: AcademyEntry; sessionId: string; attendance: ReactNode; content?: ReactNode }) {
  const href = useCanonicalHref();
  const query = useQuery({
    queryKey: sessionQueryKey(academy.id, sessionId),
    queryFn: ({ signal }) => fetchSession(academy.id, sessionId, signal),
    refetchInterval: (current) => current.state.data?.state === "live" ? DETAIL_REFRESH_MS : false,
    retry: (count, error) => !(error instanceof SessionRequestError && [400, 403, 404].includes(error.status)) && count < 2,
  });
  useBreadcrumbTitle(query.data ? `${formatDayMonth(query.data.startedAt)} - ${query.data.scheduleTitle}` : "Session");

  const missing = query.error instanceof SessionRequestError && [400, 404].includes(query.error.status);

  return (
    <main className="page-shell">
      {query.isPending && (
        <div role="status" aria-label="Loading session" className="flex flex-col gap-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      )}

      {missing && (
        <Empty className="min-h-64 rounded-xl border border-dashed border-border py-20">
          <EmptyHeader className="gap-1">
            <EmptyMedia variant="icon"><IconQuestionMark aria-hidden="true" /></EmptyMedia>
            <EmptyTitle className="text-xl font-semibold">Session not found</EmptyTitle>
            <EmptyDescription>This session does not exist in this academy.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" variant="outline" asChild><Link href={href("/app/attendance")}><IconArrowLeft />Back to sessions</Link></Button>
          </EmptyContent>
        </Empty>
      )}

      {query.isError && !missing && (
        <Alert variant="destructive">
          <IconAlertCircle />
          <AlertTitle>{query.data ? "Couldn’t refresh this session" : "Couldn’t load this session"}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            {query.data ? "Showing the last loaded details." : "Check your connection and try again."}
            <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>
              {query.isFetching ? "Retrying…" : "Retry"}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {query.data && <Details academyId={academy.id} session={query.data} />}
      {query.data && content}
      {query.data && attendance}
    </main>
  );
}

/** Why an archived session looks the way it does, and who archived or restored it. */
function ArchivedNotice({ session }: { session: SessionDetail }) {
  return (
    <Alert>
      <IconArchive />
      <AlertTitle>Archived · not counted</AlertTitle>
      <AlertDescription className="flex flex-col gap-1">
        <span>
          Archived {session.sessionArchivedAt ? formatMoment(session.sessionArchivedAt) : ""} by {startedByLabel(session.sessionArchivedByName)}.
          Its roster and attendance are kept for reference but don’t count toward attendance totals, and attendance is read-only.
        </span>
        {session.archiveNote && <span>Note: {session.archiveNote}</span>}
      </AlertDescription>
    </Alert>
  );
}

/** The session's archive and restore history, oldest first. */
function ArchiveHistory({ session }: { session: SessionDetail }) {
  if (session.archiveEvents.length === 0) return null;
  return (
    <div className="text-xs text-muted-foreground">
      <span className="font-medium">Archive history: </span>
      {session.archiveEvents.map((event, index) => (
        <span key={`${event.occurredAt}-${index}`}>
          {index > 0 && " · "}
          {event.action === "archived" ? (event.endedLive ? "Ended and archived" : "Archived") : "Restored"} by {startedByLabel(event.actorName)}, {formatMoment(event.occurredAt)}
        </span>
      ))}
    </div>
  );
}

function Details({ academyId, session }: { academyId: string; session: SessionDetail }) {
  const [ending, setEnding] = useState(false);
  const [changing, setChanging] = useState(false);
  const live = session.state === "live";
  const archived = session.sessionArchivedAt !== null;
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-bold tracking-tight">{session.scheduleTitle}</h1>
          <div className="flex flex-wrap items-center gap-2">
            {live ? <Badge>Live</Badge> : <Badge variant="destructive">Ended</Badge>}
            {archived && <Badge variant="outline"><IconArchive aria-hidden="true" />Archived</Badge>}
            <Badge variant="secondary">{session.mandatory ? "Mandatory" : "Optional"}</Badge>
            <Badge variant="secondary">{session.scheduleKind === "one_off" ? "One-off" : "Weekly"}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {live && (
            <Button variant="outline" className="text-destructive" onClick={() => setEnding(true)}><IconPlayerStop />End session</Button>
          )}
          {session.permittedActions.archive && (
            <Button variant="outline" onClick={() => setChanging(true)}><IconArchive />{live ? "End and archive" : "Archive"}</Button>
          )}
          {session.permittedActions.restore && (
            <Button variant="outline" onClick={() => setChanging(true)}><IconArchiveOff />Restore</Button>
          )}
        </div>
      </div>

      {archived && <ArchivedNotice session={session} />}

      <SessionFacts session={session} />
      <ArchiveHistory session={session} />

      <EndSessionDialog
        academyId={academyId}
        sessionId={session.id}
        title={session.scheduleTitle}
        open={ending}
        onClose={() => setEnding(false)}
      />
      {(session.permittedActions.archive || session.permittedActions.restore) && (
        <ArchiveSessionDialog
          academyId={academyId}
          sessionId={session.id}
          mode={archived ? "restore" : "archive"}
          open={changing}
          onClose={() => setChanging(false)}
        />
      )}
    </>
  );
}
