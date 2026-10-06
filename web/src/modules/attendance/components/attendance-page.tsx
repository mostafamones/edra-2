"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconAlertCircle, IconArrowLeft, IconChecklist, IconLock, IconQuestionMark, IconSearch,
  IconUsers, IconUserX, IconWifiOff,
} from "@tabler/icons-react";

import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useBreadcrumbTitle } from "@/components/shared/breadcrumb-title";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import type { AcademyEntry } from "@/modules/academies";
import { AcademyGate, useAuth } from "@/modules/auth";
import { useCanonicalHref } from "@/modules/navigation";
import { AttendanceRequestError, attendanceQueryKey, fetchAttendance } from "../queries";
import type { AttendanceSheet, AttendanceStatus, PublicationState } from "../types";
import { CheckIn } from "./check-in";
import { formatClock, formatMoment, INPUT_STATUSES, STATUS_LABELS } from "./labels";
import { PublishDialog } from "./publish-dialog";
import { SheetTable } from "./sheet-table";
import { useAttendanceChannel, type ChannelStatus } from "./use-channel";
import { useAttendanceEdits } from "./use-edits";
import { Separator } from "@/components/ui/separator";

/** Reconciliation while realtime works, and polling while it is degraded. */
const RECONCILE_MS = 60_000;
const DEGRADED_POLL_MS = 15_000;

type StatusFilter = "all" | AttendanceStatus | "correction";

const PUBLICATION_LABELS: Record<PublicationState, string> = {
  unpublished: "Not published",
  published: "Published",
  pending_corrections: "Corrections pending",
};

/** `/app/sessions/<id>/attendance`: take, review, and publish one session's attendance. */
export function AttendancePage({ sessionId }: { sessionId: string }) {
  return <AcademyGate>{(academy) => <SheetContent academy={academy} sessionId={sessionId} />}</AcademyGate>;
}

function SheetContent({ academy, sessionId }: { academy: AcademyEntry; sessionId: string }) {
  const href = useCanonicalHref();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const key = attendanceQueryKey(academy.id, sessionId);

  const onInvalidate = useCallback((revision: number | null) => {
    const sheetKey = attendanceQueryKey(academy.id, sessionId);
    const cached = queryClient.getQueryData<AttendanceSheet>(sheetKey);
    // Ignore an older invalidation that arrives after a newer refetch.
    if (revision !== null && cached && revision < cached.revision) return;
    void queryClient.invalidateQueries({ queryKey: sheetKey });
  }, [queryClient, academy.id, sessionId]);
  const metadata = user?.user_metadata as { full_name?: string } | undefined;
  const channel = useAttendanceChannel({
    academyId: academy.id, sessionId, userId: user?.id ?? null, name: metadata?.full_name || "Staff member", onInvalidate,
  });

  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => fetchAttendance(academy.id, sessionId, signal),
    refetchInterval: channel.status === "live" ? RECONCILE_MS : DEGRADED_POLL_MS,
    refetchOnWindowFocus: true,
    retry: (count, error) => !(error instanceof AttendanceRequestError && [400, 403, 404].includes(error.status)) && count < 2,
  });
  useBreadcrumbTitle(query.data ? `Attendance - ${query.data.session.scheduleTitle}` : "Attendance");
  const missing = query.error instanceof AttendanceRequestError && [400, 404].includes(query.error.status);

  return (
    <main className="page-shell">
      {query.isPending && (
        <div role="status" aria-label="Loading attendance" className="flex flex-col gap-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
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
            <Button size="sm" variant="outline" asChild><Link href={href("/app/sessions")}><IconArrowLeft />Back to sessions</Link></Button>
          </EmptyContent>
        </Empty>
      )}

      {query.isError && !missing && (
        <Alert variant="destructive">
          <IconAlertCircle />
          <AlertTitle>{query.data ? "Couldn’t refresh attendance" : "Couldn’t load attendance"}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            {query.data ? "Showing the last loaded values. Saving still checks the latest values." : "Check your connection and try again."}
            <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>
              {query.isFetching ? "Retrying…" : "Retry"}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {query.data && (
        <Sheet sheet={query.data} syncedAt={query.dataUpdatedAt} channelStatus={channel.status} peers={channel.peers.map((peer) => peer.name)} />
      )}
    </main>
  );
}

const STATUS_DOTS: Record<AttendanceStatus, string> = {
  present: "bg-emerald-500", late: "bg-amber-500", absent: "bg-red-500", excused: "bg-sky-500", unknown: "bg-muted-foreground/60",
};

/** A count that doubles as a filter: click to show only that status, click again to clear. */
function StatTile({ label, count, dot, active, onClick }: { label: string; count: number; dot?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex flex-col gap-0.5 rounded-xl border px-3 py-2 text-left transition-colors outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50",
        active ? "border-foreground/30 bg-muted/50" : "border-border",
      )}
    >
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {dot && <span className={cn("size-1.5 rounded-full", dot)} aria-hidden="true" />}{label}
      </span>
      <span className="text-lg font-semibold tabular-nums">{count}</span>
    </button>
  );
}

/** A compact connection pill; the sync time and who else is here live in tooltips. */
function SyncStatus({ status, syncedAt, peers }: { status: ChannelStatus; syncedAt: number; peers: string[] }) {
  const synced = syncedAt ? `Synced ${formatClock(new Date(syncedAt).toISOString())}` : "Not synced yet";
  return (
    <div className="flex items-center gap-1.5" role="status">
      <Tooltip>
        <TooltipTrigger asChild>
          {status === "degraded" ? (
            <Badge variant="destructive" className="gap-1.5"><IconWifiOff className="size-3" aria-hidden="true" />Offline · retrying</Badge>
          ) : (
            <Badge variant="outline" className="gap-1.5 text-muted-foreground">
              <span className="relative flex size-1.5" aria-hidden="true">
                {status === "live" && <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60" />}
                <span className={cn("relative inline-flex size-1.5 rounded-full", status === "live" ? "bg-primary" : "bg-muted-foreground/60")} />
              </span>
              {status === "live" ? "Realtime" : "Connecting…"}
            </Badge>
          )}
        </TooltipTrigger>
        <TooltipContent>
          {status === "degraded" ? "Live updates unavailable. Refreshing every 15 seconds." : status === "live" ? "Live updates are on." : "Connecting to live updates."} {synced}.
        </TooltipContent>
      </Tooltip>
      {peers.length > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="gap-1 text-muted-foreground"><IconUsers className="size-3" aria-hidden="true" />{peers.length}</Badge>
          </TooltipTrigger>
          <TooltipContent>Also here: {peers.slice(0, 5).join(", ")}{peers.length > 5 ? ` and ${peers.length - 5} more` : ""}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

function Sheet({ sheet, syncedAt, channelStatus, peers }: { sheet: AttendanceSheet; syncedAt: number; channelStatus: ChannelStatus; peers: string[] }) {
  const href = useCanonicalHref();
  const { session } = sheet;
  const edits = useAttendanceEdits(session.academyId, session.id);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [publishing, setPublishing] = useState(false);
  const [markingAbsent, setMarkingAbsent] = useState(false);
  const editable = sheet.permittedActions.edit;
  const live = session.state === "live";

  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return sheet.entries.filter((entry) =>
      (!term || entry.fullName.toLocaleLowerCase().includes(term))
      && (filter === "all" || (filter === "correction" ? entry.correctionPending : entry.status === filter)));
  }, [sheet.entries, search, filter]);
  // Unrecorded expected students of a mandatory class: the explicit "mark absent" action's target.
  const unrecorded = sheet.entries.filter((entry) => entry.status === "unknown" && entry.origin === "expected");
  const corrections = sheet.entries.filter((entry) => entry.correctionPending).length;
  const selectedEntries = sheet.entries.filter((entry) => selected.has(entry.annualStudentRecordId));

  function select(ids: string[], checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const id of ids) if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }

  async function setSelectedStatus(status: AttendanceStatus) {
    const changes = selectedEntries.filter((entry) => entry.status !== status)
      .map((entry) => ({ annualStudentRecordId: entry.annualStudentRecordId, status, expectedVersion: entry.version }));
    if (changes.length === 0) { setSelected(new Set()); return; }
    const saved = await edits.applyBulk(changes, `${changes.length} ${changes.length === 1 ? "student" : "students"} marked ${STATUS_LABELS[status].toLowerCase()}.`);
    if (saved) setSelected(new Set());
  }

  async function markUnrecordedAbsent() {
    const changes = unrecorded.map((entry) => ({ annualStudentRecordId: entry.annualStudentRecordId, status: "absent" as const, expectedVersion: entry.version }));
    const saved = await edits.applyBulk(changes, `${changes.length} unrecorded ${changes.length === 1 ? "student" : "students"} marked absent.`);
    if (saved) setMarkingAbsent(false);
  }

  // Opened from the sessions list (not the details page), so Back returns there.
  const fromSessions = useSearchParams().get("from") === "sessions";
  const canPublish = sheet.permittedActions.publish && sheet.publication !== "published";

  return (
    <>
      <div className="flex flex-col gap-3">
        <Button variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground" asChild>
          {fromSessions
            ? <Link href={href("/app/sessions")}><IconArrowLeft />Sessions</Link>
            : <Link href={href(`/app/sessions/${session.id}`)}><IconArrowLeft />Session details</Link>}
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-heading text-2xl font-bold tracking-tight">{session.scheduleTitle}</h1>
            </div>
            <div className="flex flex-row gap-2 items-center">
              <p className="text-sm text-muted-foreground">
                {[session.groupName, session.mandatory ? "Mandatory" : "Optional"].filter(Boolean).join(" · ")}
              </p>
              <SyncStatus status={channelStatus} syncedAt={syncedAt} peers={peers} />
              <Badge variant={sheet.publication === "published" ? "outline" : "secondary"}>{PUBLICATION_LABELS[sheet.publication]}</Badge>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
              {sheet.permittedActions.publish && (
              <Button onClick={() => setPublishing(true)} disabled={!canPublish}>
                <IconChecklist />{sheet.publicationCount > 0 ? "Save" : "Publish"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {!session.yearOpen ? (
        <Alert>
          <IconLock />
          <AlertTitle>Read-only</AlertTitle>
          <AlertDescription>This academic year is closed, so attendance can no longer change.</AlertDescription>
        </Alert>
      ) : !live ? (
        <Alert>
          <IconAlertCircle />
          <AlertTitle>This session has ended</AlertTitle>
          <AlertDescription>Check-ins are closed. You can still correct attendance and publish it.</AlertDescription>
        </Alert>
      ) : null}

      {sheet.permittedActions.checkIn && sheet.entries.length > 0 && (
        <div className="rounded-xl border border-border bg-card/30 p-3">
          <CheckIn academyId={session.academyId} sessionId={session.id} entries={sheet.entries} showCodes={sheet.studentCodesEnabled} />
        </div>
      )}

      <div role="group" aria-label="Filter by status" className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        <StatTile label="Roster" count={sheet.counts.total} active={filter === "all"} onClick={() => setFilter("all")} />
        {INPUT_STATUSES.map((status) => (
          <StatTile
            key={status}
            label={STATUS_LABELS[status]}
            count={sheet.counts[status]}
            dot={STATUS_DOTS[status]}
            active={filter === status}
            onClick={() => setFilter(filter === status ? "all" : status)}
          />
        ))}
      </div>

      <Separator />

      {sheet.entries.length > 0 && (
        <div className="flex items-center justify-between">
          <div>
            {sheet.lastPublishedAt && (
              <p className="text-sm text-muted-foreground">
                Last published {formatMoment(sheet.lastPublishedAt)}{sheet.lastPublishedByName ? <span> by <strong>{sheet.lastPublishedByName}</strong></span> : ""}.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {corrections > 0 && (
              <Button size="default" variant="outline" className={filter === "correction" ? "bg-foreground/20!" : ""} aria-pressed={filter === "correction"} onClick={() => setFilter(filter === "correction" ? "all" : "correction")}>
                Pending<Badge variant="outline" className="tabular-nums">{corrections}</Badge>
              </Button>
            )}
            <div className=" flex flex-wrap items-center gap-2">
              {editable && selected.size > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline" disabled={edits.bulkBusy}>
                      {edits.bulkBusy ? "Saving…" : `Set ${selected.size} selected`}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {INPUT_STATUSES.map((status) => (
                      <DropdownMenuItem key={status} onSelect={() => void setSelectedStatus(status)}>{STATUS_LABELS[status]}</DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {editable && session.mandatory && unrecorded.length > 0 && (
                <Button variant="outline" className="text-destructive" onClick={() => setMarkingAbsent(true)} disabled={edits.bulkBusy}>
                  <IconUserX />Mark rest absent
                </Button>
              )}
            </div>
            <InputGroup className="w-sm sm:max-w-xs">
              <InputGroupInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search students" aria-label="Search students" />
              <InputGroupAddon><IconSearch /></InputGroupAddon>
            </InputGroup>
          </div>
        </div>
      )}

      <SheetTable
        total={sheet.entries.length}
        rows={rows}
        editable={editable}
        pending={edits.pending}
        selected={selected}
        onSelect={select}
        onStatus={(entry, status) => void edits.setStatus(entry, status)}
        onClearFilters={() => { setSearch(""); setFilter("all"); }}
      />

      {publishing && <PublishDialog sheet={sheet} onClose={() => setPublishing(false)} />}

      <AlertDialog open={markingAbsent} onOpenChange={(next) => { if (!next && !edits.bulkBusy) setMarkingAbsent(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark {unrecorded.length} unrecorded {unrecorded.length === 1 ? "student" : "students"} absent?</AlertDialogTitle>
            <AlertDialogDescription>
              Only expected students still marked Unknown change. This is a draft: nothing is official until you publish.
              If someone records one of them first, nothing changes and you can review again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={edits.bulkBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={edits.bulkBusy} onClick={(event) => { event.preventDefault(); void markUnrecordedAbsent(); }}>
              {edits.bulkBusy ? "Saving…" : "Mark absent"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
