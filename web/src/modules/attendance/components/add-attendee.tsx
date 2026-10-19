"use client";

import { useDeferredValue, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { IconSearch, IconUserPlus } from "@tabler/icons-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { newUuid } from "@/lib/uuid";
import { useAcademyScope } from "@/modules/auth";
import { addSessionAttendee, findAttendees } from "../actions";
import { attendanceQueryKey } from "../queries";
import type { AddAttendeeResult, AttendanceSheet, AttendeeCandidate } from "../types";

type Props = { sheet: AttendanceSheet; onClose: () => void };

const RETRYABLE = new Set(["unavailable", "throttled"]);

/**
 * Explicitly adds a student of the session's academy and year who is not on the roster. Searching
 * writes nothing; only Add does, against the revision shown when the student was chosen. Adding does
 * not check the student in. Mount it only while open.
 */
export function AddAttendeeDialog({ sheet, onClose }: Props) {
  const queryClient = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  const academyId = sheet.session.academyId;
  const sessionId = sheet.session.id;
  const [typed, setTyped] = useState("");
  const query = useDeferredValue(typed.trim());
  const [chosen, setChosen] = useState<{ student: AttendeeCandidate; revision: number; key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const results = useInfiniteQuery({
    queryKey: [...attendanceQueryKey(academyId, sessionId), "attendees", query],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const page = await findAttendees({ academyId, sessionId, query, offset: pageParam });
      if (!page.ok) throw new Error(page.message);
      return page;
    },
    getNextPageParam: (last, pages) => (last.hasMore ? pages.reduce((total, page) => total + page.items.length, 0) : undefined),
  });
  const candidates = results.data?.pages.flatMap((page) => page.items) ?? [];
  const changedSinceChoice = chosen !== null && chosen.revision !== sheet.revision;

  function choose(student: AttendeeCandidate) {
    if (busy) return;
    setError("");
    setChosen({ student, revision: sheet.revision, key: newUuid() });
  }

  async function add() {
    if (!chosen || busy) return;
    setError(""); setBusy(true);
    let result: AddAttendeeResult;
    try {
      result = await addSessionAttendee({
        academyId, sessionId, annualStudentRecordId: chosen.student.annualStudentRecordId,
        expectedRevision: chosen.revision, idempotencyKey: chosen.key,
      });
    } catch {
      result = { ok: false, code: "unavailable", message: "Could not add the student. Check your connection and try again." };
    } finally {
      setBusy(false);
    }
    await queryClient.invalidateQueries({ queryKey: attendanceQueryKey(academyId, sessionId) });
    if (!isCurrentAcademy(academyId)) return;
    if (!result.ok) {
      setError(result.message);
      // Uncertain: Retry resends the same command. Definitive: choose again for a new one.
      if (!RETRYABLE.has(result.code)) setChosen(null);
      return;
    }
    if (result.outcome === "stale") {
      setChosen({ ...chosen, revision: result.revision, key: newUuid() });
      setError("Attendance changed meanwhile. Review and add again.");
      return;
    }
    toast.success(result.outcome === "added"
      ? `${result.entry.fullName} added to this session.`
      : `${result.entry.fullName} is already on this session’s roster.`);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add attendee</DialogTitle>
        </DialogHeader>
        <InputGroup>
          <InputGroupInput
            value={typed}
            onChange={(event) => setTyped(event.target.value.slice(0, 100))}
            placeholder={sheet.studentCodesEnabled ? "Name or code" : "Name"}
            aria-label={sheet.studentCodesEnabled ? "Search students by name or code" : "Search students by name"}
            autoFocus
          />
          <InputGroupAddon><IconSearch /></InputGroupAddon>
        </InputGroup>

        <div className="max-h-72 overflow-y-auto">
          {results.isPending ? (
            <div role="status" aria-label="Loading students" className="flex flex-col gap-2">
              <Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" />
            </div>
          ) : results.isError && candidates.length === 0 ? (
            <div role="alert" className="flex flex-col items-start gap-2 text-sm text-destructive">
              {results.error.message}
              <Button size="sm" variant="outline" onClick={() => void results.refetch()}>Retry</Button>
            </div>
          ) : candidates.length === 0 ? (
            <Empty className="p-6">
              <EmptyHeader>
                <EmptyMedia variant="icon"><IconUserPlus /></EmptyMedia>
                <EmptyTitle>{query ? "No student matches" : "No students to add"}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="flex flex-col gap-1" aria-label="Students">
              {candidates.map((student) => {
                const selected = chosen?.student.annualStudentRecordId === student.annualStudentRecordId;
                return (
                  <li key={student.annualStudentRecordId}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      disabled={busy}
                      onClick={() => choose(student)}
                      className={cn("flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm hover:bg-muted",
                        selected ? "border-primary bg-muted" : "border-transparent")}
                    >
                      <span className="flex flex-col">
                        <span className="font-medium">{student.fullName}</span>
                        <span className="text-xs text-muted-foreground">
                          {[student.levelName, student.groupName, student.participationType === "online_only" ? "Online" : null].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      {student.studentCode && <span className="font-mono text-xs text-muted-foreground">{student.studentCode}</span>}
                    </button>
                  </li>
                );
              })}
              {results.hasNextPage && (
                <li>
                  <Button variant="ghost" size="sm" className="w-full" disabled={results.isFetchingNextPage} onClick={() => void results.fetchNextPage()}>
                    {results.isFetchingNextPage ? "Loading…" : "Show more"}
                  </Button>
                </li>
              )}
            </ul>
          )}
        </div>

        {changedSinceChoice && !error && (
          <p role="status" className="text-sm text-muted-foreground">Attendance changed after you chose this student.</p>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          {changedSinceChoice && chosen ? (
            <Button onClick={() => choose(chosen.student)} disabled={busy}>I’ve reviewed the latest</Button>
          ) : (
            <Button onClick={() => void add()} disabled={!chosen || busy}>
              {busy ? "Adding…" : chosen ? `Add ${chosen.student.fullName}` : "Add"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
