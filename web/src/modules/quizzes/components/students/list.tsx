"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { IconAlertCircle, IconSearch, IconSearchOff, IconUsers } from "@tabler/icons-react";

import { FilterPopover } from "@/components/shared/filter-popover";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatScore } from "@/lib/score";
import type { AcademyEntry } from "@/modules/academies";
import { useAcademyScope } from "@/modules/auth";
import { announceQuizResults } from "../../actions";
import { announceable, type QuizPermissions } from "../../permissions";
import { loadQuizStudents, quizStudentsQueryKey, quizzesRootKey } from "../../queries";
import { matchesSearch, STATUS_FILTERS, studentStatus, type StatusFilter } from "../../status";
import type { AnnounceFailureReason, Quiz } from "../../types";
import { REASON_LABELS, STATUS_BADGE, STATUS_LABELS } from "../shared/labels";
import { useAttemptKey } from "../shared/use-attempt-key";
import { StudentSheet } from "./sheet";

const REASONS: Record<AnnounceFailureReason, string> = {
  not_submitted: "has no accepted work",
  stale: "changed since you loaded the list",
  incomplete: "has written questions that aren’t marked",
};

type Props = { academy: AcademyEntry; quiz: Quiz; permissions: QuizPermissions };

/**
 * Everyone currently in the audience plus every student who has work, even after leaving it. Staff
 * open a student to enter physical work, review, mark and announce; complete results can also be
 * announced for selected students at once (no whole-cohort requirement).
 */
export function QuizStudents({ academy, quiz, permissions }: Props) {
  const queryClient = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  const attempt = useAttemptKey();
  const query = useQuery({
    queryKey: quizStudentsQueryKey(academy.id, quiz.id),
    queryFn: () => loadQuizStudents(academy.id, quiz.id),
    refetchInterval: 30_000,
  });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [announcing, setAnnouncing] = useState(false);
  const [rejection, setRejection] = useState<{ name: string; reason: AnnounceFailureReason }[] | null>(null);

  const students = useMemo(() => query.data ?? [], [query.data]);
  const rows = students.filter((row) => matchesSearch(row, search) && (filter === "all" || studentStatus(row) === filter));
  const chosen = students.filter((row) => selected.has(row.recordId) && announceable(row));
  const visibleAnnounceable = rows.filter(announceable);
  const allVisibleChosen = visibleAnnounceable.length > 0 && visibleAnnounceable.every((row) => selected.has(row.recordId));
  const filtering = search.trim() !== "" || filter !== "all";

  async function announce() {
    if (chosen.length === 0) return;
    setAnnouncing(true);
    setRejection(null);
    const items = chosen.map((row) => ({ recordId: row.recordId, expectedVersion: row.version }));
    try {
      const result = await announceQuizResults({
        academyId: academy.id, quizId: quiz.id, expectedScoringRevision: quiz.scoringRevision, items,
        key: attempt.keyFor(JSON.stringify([quiz.scoringRevision, items])),
      });
      if (!isCurrentAcademy(academy.id)) return;
      if (!result.ok) { toast.error(result.message); return; }
      if (result.outcome === "rejected") {
        const names = new Map(students.map((row) => [row.recordId, row.fullName]));
        setRejection(result.failures.map((entry) => ({ name: names.get(entry.recordId) ?? "A student", reason: entry.reason })));
        return;
      }
      attempt.reset();
      setSelected(new Set());
      const changed = result.results.filter((entry) => entry.outcome !== "unchanged").length;
      toast.success(changed === 0 ? "These results were already announced." : `${changed} result${changed === 1 ? "" : "s"} announced.`);
    } catch {
      if (isCurrentAcademy(academy.id)) toast.error("Could not reach the server. Nothing was announced; try again.");
    } finally {
      setAnnouncing(false);
      void queryClient.invalidateQueries({ queryKey: quizzesRootKey(academy.id) });
    }
  }

  if (query.isPending) {
    return <div role="status" aria-label="Loading students" className="flex flex-col gap-2">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-12" />)}</div>;
  }
  if (query.isError && !query.data) {
    return (
      <Alert variant="destructive">
        <IconAlertCircle />
        <AlertTitle>Couldn’t load students</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center gap-3">
          Check your connection and try again.
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>Retry</Button>
        </AlertDescription>
      </Alert>
    );
  }

  const maxScore = formatScore(quiz.effectiveMaxScore);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <InputGroup className="sm:max-w-sm">
          <InputGroupInput type="search" placeholder="Search name or code" aria-label="Search students" value={search} onChange={(event) => setSearch(event.target.value)} />
          <InputGroupAddon><IconSearch /></InputGroupAddon>
        </InputGroup>
        <div className="flex gap-2 sm:ml-auto">
          <FilterPopover iconOnly fields={[{
            id: "status", label: "Status", value: filter, defaultValue: "all",
            options: STATUS_FILTERS.map((value) => ({ value, label: value === "all" ? "All statuses" : STATUS_LABELS[value] })),
            onChange: (value) => setFilter(value as StatusFilter),
          }]} />
          {permissions.mark && (
            <Button disabled={chosen.length === 0 || announcing} onClick={() => void announce()}>
              {announcing ? "Announcing…" : chosen.length ? `Announce ${chosen.length} result${chosen.length === 1 ? "" : "s"}` : "Announce results"}
            </Button>
          )}
        </div>
      </div>

      {rejection && (
        <Alert variant="destructive">
          <IconAlertCircle />
          <AlertTitle>Nothing was announced</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">{rejection.map((entry, index) => <li key={index}>{entry.name} {REASONS[entry.reason]}.</li>)}</ul>
            Refresh, fix or deselect these students, then announce again.
          </AlertDescription>
        </Alert>
      )}

      {students.length === 0 ? (
        <Empty className="min-h-48 rounded-xl border border-dashed border-border py-14">
          <EmptyHeader className="gap-1">
            <EmptyMedia variant="icon"><IconUsers aria-hidden="true" /></EmptyMedia>
            <EmptyTitle>No students</EmptyTitle>
            <EmptyDescription>
              {quiz.audience === null ? "Choose who the quiz is for in its setup." : "No active student matches the audience yet. Students who join it later appear here."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : rows.length === 0 ? (
        <Empty className="min-h-48 rounded-xl border border-dashed border-border py-14">
          <EmptyHeader className="gap-1">
            <EmptyMedia variant="icon"><IconSearchOff aria-hidden="true" /></EmptyMedia>
            <EmptyTitle>No matching students</EmptyTitle>
            <EmptyDescription>{filtering ? "No student matches this search and status." : "Try a different name or code."}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent><Button size="sm" variant="outline" onClick={() => { setSearch(""); setFilter("all"); }}>Clear search and filters</Button></EmptyContent>
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                {permissions.mark && (
                  <TableHead className="w-10">
                    <Checkbox aria-label="Select every student shown whose result can be announced" checked={allVisibleChosen} disabled={visibleAnnounceable.length === 0}
                      onCheckedChange={(on) => setSelected((current) => {
                        const next = new Set(current);
                        for (const row of visibleAnnounceable) { if (on === true) next.add(row.recordId); else next.delete(row.recordId); }
                        return next;
                      })} />
                  </TableHead>
                )}
                <TableHead className="w-24">Code</TableHead>
                <TableHead>Student</TableHead>
                <TableHead className="w-48">Status</TableHead>
                <TableHead className="w-36 text-right">Current result</TableHead>
                <TableHead className="w-36 text-right">Announced</TableHead>
                <TableHead className="w-20"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const status = studentStatus(row);
                return (
                  <TableRow key={row.recordId}>
                    {permissions.mark && (
                      <TableCell>
                        <Checkbox aria-label={`Select ${row.fullName}`} checked={selected.has(row.recordId)} disabled={!announceable(row)}
                          onCheckedChange={(on) => setSelected((current) => { const next = new Set(current); if (on === true) next.add(row.recordId); else next.delete(row.recordId); return next; })} />
                      </TableCell>
                    )}
                    <TableCell className="font-mono text-muted-foreground">{row.studentCode ?? "—"}</TableCell>
                    <TableCell>
                      <span className="font-medium">{row.fullName}</span>
                      {!row.eligible && <Badge variant="outline" className="ml-2">Not in audience now</Badge>}
                      {row.archived && <Badge variant="secondary" className="ml-2">Archived record</Badge>}
                      {row.groupName && <span className="block text-xs text-muted-foreground">{row.groupName}</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE[status]}>{STATUS_LABELS[status]}</Badge>
                      {row.submission && <span className="mt-0.5 block text-xs text-muted-foreground">{REASON_LABELS[row.submission.reason]}</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.result ? (
                        <>
                          {row.result.complete ? `${formatScore(row.result.total)} / ${maxScore}` : <span className="text-muted-foreground">Incomplete</span>}
                          {row.result.required > 0 && <span className="block text-xs text-muted-foreground">{row.result.marked} of {row.result.required} marked</span>}
                        </>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.publication ? `${formatScore(row.publication.total)} / ${formatScore(row.publication.maxScore)}` : <span className="text-muted-foreground">—</span>}
                      {row.publication && row.publication.revision > 1 && <span className="block text-xs text-muted-foreground">Revision {row.publication.revision}</span>}
                    </TableCell>
                    <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => setOpen(row.recordId)}>Open</Button></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <StudentSheet academy={academy} quiz={quiz} permissions={permissions} recordId={open} name={students.find((row) => row.recordId === open)?.fullName ?? ""} onClose={() => setOpen(null)} />
    </div>
  );
}
