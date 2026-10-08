"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconAlertCircle, IconChecklist, IconSearch, IconUsers, IconUserX, IconWifiOff, IconX,
} from "@tabler/icons-react";

import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Toggle } from "@/components/ui/toggle";
import type { AcademyEntry } from "@/modules/academies";
import { AcademyGate, useAuth } from "@/modules/auth";
import { AttendanceRequestError, attendanceQueryKey, fetchAttendance } from "../queries";
import type { AttendanceSheet, AttendanceStatus, PublicationState } from "../types";
import { CheckIn } from "./check-in";
import { formatClock, formatMoment, INPUT_STATUSES, STATUS_DOTS, STATUS_LABELS, statusName } from "./labels";
import { AttendanceOverview } from "./overview";
import { SheetNotice } from "./notice";
import { PublishDialog } from "./publish-dialog";
import { SheetTable } from "./sheet-table";
import { useAttendanceChannel, type ChannelStatus } from "./use-channel";
import { useAttendanceEdits } from "./use-edits";

/** Reconciliation while realtime works, and polling while it is degraded. */
const RECONCILE_MS = 60_000;
const DEGRADED_POLL_MS = 15_000;

type StatusFilter = "all" | AttendanceStatus | "correction";

const PUBLICATION_LABELS: Record<PublicationState, string> = {
  unpublished: "Not published",
  published: "Published",
  pending_corrections: "Corrections pending",
};

/** The attendance section of `/app/attendance/<id>`: take, review, and publish one session's attendance. */
export function AttendanceSection({ sessionId }: { sessionId: string }) {
  return <AcademyGate>{(academy) => <SheetContent academy={academy} sessionId={sessionId} />}</AcademyGate>;
}

function SheetContent({ academy, sessionId }: { academy: AcademyEntry; sessionId: string }) {
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

  return (
    <section aria-labelledby="attendance-heading" className="flex flex-col gap-4">
      {query.isPending && (
        <div role="status" aria-label="Loading attendance" className="flex flex-col gap-4">
          <Skeleton className="h-96 rounded-xl" />
        </div>
      )}

      {query.isError && (
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
    </section>
  );
}

/** A status filter chip with its color and count; pressing an active chip clears the filter. */
function FilterChip({ label, count, dot, pressed, onPressedChange }: {
  label: string; count: number; dot?: string; pressed: boolean; onPressedChange: (pressed: boolean) => void;
}) {
  return (
    <Toggle size="sm" variant="outline" pressed={pressed} onPressedChange={onPressedChange} className="gap-1.5 rounded-full px-3 aria-pressed:border-foreground/25">
      {dot && <span className={cn("size-2 rounded-full", dot)} aria-hidden="true" />}
      {label}
      <span className="text-muted-foreground tabular-nums">{count}</span>
    </Toggle>
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

  const canPublish = sheet.permittedActions.publish && sheet.publication !== "published";

  return (
    <>
      <Card className="gap-0 bg-card/20 py-0 shadow-none">
        <CardHeader className="border-b py-4 items-center flex">
          <CardTitle className="flex flex-1 items-center gap-2.5">
            <h2 id="attendance-heading" className="text-lg font-bold tracking-tight">Attendance</h2>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant={sheet.publication === "published" ? "outline" : "secondary"}>{PUBLICATION_LABELS[sheet.publication]}</Badge>
              </TooltipTrigger>
              <TooltipContent>
                {sheet.lastPublishedAt
                  ? <>Last published {formatMoment(sheet.lastPublishedAt)}{sheet.lastPublishedByName ? ` by ${sheet.lastPublishedByName}` : ""}.</>
                  : "Drafts stay private until you publish them."}
              </TooltipContent>
            </Tooltip>
          </CardTitle>
          <CardAction className="flex flex-wrap items-center justify-end gap-2">
            <SyncStatus status={channelStatus} syncedAt={syncedAt} peers={peers} />
            {sheet.permittedActions.publish && (
              <Button onClick={() => setPublishing(true)} disabled={!canPublish}>
                <IconChecklist />{sheet.publicationCount > 0 ? "Save" : "Publish"}
              </Button>
            )}
          </CardAction>
        </CardHeader>

        {(!session.yearOpen || !live) && <SheetNotice sessionId={session.id} kind={!session.yearOpen ? "read-only" : "ended"} />}

        {sheet.entries.length > 0 && (
          <div className="px-4 pt-4 pb-3">
            <AttendanceOverview
              counts={sheet.counts}
              action={sheet.permittedActions.checkIn && (
                <CheckIn academyId={session.academyId} sessionId={session.id} entries={sheet.entries} showCodes={sheet.studentCodesEnabled} />
              )}
            />
          </div>
        )}

        {sheet.entries.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <div role="group" aria-label="Filter by status" className="flex flex-wrap items-center gap-1.5">
              <FilterChip label="All" count={sheet.counts.total} pressed={filter === "all"} onPressedChange={() => setFilter("all")} />
              {INPUT_STATUSES.map((status) => (
                <FilterChip
                  key={status}
                  label={statusName(status)}
                  count={sheet.counts[status]}
                  dot={STATUS_DOTS[status]}
                  pressed={filter === status}
                  onPressedChange={(pressed) => setFilter(pressed ? status : "all")}
                />
              ))}
              {corrections > 0 && (
                <FilterChip
                  label="Corrections"
                  count={corrections}
                  dot="bg-foreground/40"
                  pressed={filter === "correction"}
                  onPressedChange={(pressed) => setFilter(pressed ? "correction" : "all")}
                />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {editable && session.mandatory && unrecorded.length > 0 && (
                <Button variant="outline" size="sm" className="text-destructive" onClick={() => setMarkingAbsent(true)} disabled={edits.bulkBusy}>
                  <IconUserX />Mark {unrecorded.length} untracked absent
                </Button>
              )}
              <InputGroup className="w-full sm:w-64">
                <InputGroupInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search students" aria-label="Search students" />
                <InputGroupAddon><IconSearch /></InputGroupAddon>
              </InputGroup>
            </div>
          </div>
        )}

        {editable && selected.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2">
            <span className="text-sm font-medium">{selected.size} selected</span>
            <div className="flex items-center gap-1.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" disabled={edits.bulkBusy}>{edits.bulkBusy ? "Saving…" : "Set status"}</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {INPUT_STATUSES.map((status) => (
                    <DropdownMenuItem key={status} onSelect={() => void setSelectedStatus(status)}>
                      <span className={cn("size-2 rounded-full", STATUS_DOTS[status])} aria-hidden="true" />{statusName(status)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button size="icon-sm" variant="ghost" aria-label="Clear selection" onClick={() => setSelected(new Set())} disabled={edits.bulkBusy}>
                <IconX />
              </Button>
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
      </Card>

      {publishing && <PublishDialog sheet={sheet} onClose={() => setPublishing(false)} />}

      <AlertDialog open={markingAbsent} onOpenChange={(next) => { if (!next && !edits.bulkBusy) setMarkingAbsent(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark {unrecorded.length} untracked {unrecorded.length === 1 ? "student" : "students"} absent?</AlertDialogTitle>
            <AlertDialogDescription>Nothing is official until you publish.</AlertDialogDescription>
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
