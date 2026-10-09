"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { IconAlertCircle, IconBolt, IconSearch, IconSearchOff, IconUsers } from "@tabler/icons-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAcademyScope } from "@/modules/auth";
import { publishStudentResults } from "../../../actions";
import { focusScore, focusTarget, matchesFocus, type MarkFocus } from "../../../focus";
import { assignmentPermissions } from "../../../permissions";
import { assignmentsRootKey } from "../../../queries";
import { formatScore } from "../../../score";
import type { Assignment, MarkFilter, PublishFailureReason, StudentWork } from "../../../types";
import { FocusFilter } from "./focus";
import { RESULT_BADGE, RESULT_LABELS, WORK_BADGE, WORK_LABELS } from "../../shared/labels";
import { StudentSheet } from "../../marking/student";
import { useAttemptKey, useMarks } from "../../../hooks/use-marks";
import type { AcademyEntry } from "@/modules/academies";

const FILTERS: { value: MarkFilter; label: string }[] = [
  { value: "all", label: "All students" },
  { value: "not_received", label: "Work not received" },
  { value: "needs_marking", label: "Needs marking" },
  { value: "marked", label: "Fully marked" },
  { value: "unpublished", label: "Marked, not published" },
];

const MATCHES: Record<MarkFilter, (row: StudentWork) => boolean> = {
  all: () => true,
  not_received: (row) => row.workStatus === "expected" || row.workStatus === "missing",
  needs_marking: (row) => (row.workStatus === "submitted" || row.workStatus === "late") && row.marking !== "complete",
  marked: (row) => row.marking === "complete",
  unpublished: (row) => row.marking === "complete" && row.publicationState !== "published",
};

const REASONS: Record<PublishFailureReason, string> = {
  not_recipient: "isn’t a recipient",
  stale: "changed since you loaded the list",
  incomplete: "has parts that aren’t marked yet",
};

/** A student's result can be published once every part has a mark and it differs from what is published. */
const publishable = (row: StudentWork) => row.marking === "complete" && row.publicationState !== "published";

type Props = { academy: AcademyEntry; assignment: Assignment; focus: MarkFocus | null; onFocusChange: (focus: MarkFocus | null) => void };

/**
 * The students of the assignment: work status, marks, totals, and per-student result publication. A
 * part or question focus (also set from the marks chart) narrows it to who lost or kept those marks.
 */
export function AssignmentStudents({ academy, assignment, focus, onFocusChange }: Props) {
  const queryClient = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  const attempt = useAttemptKey();
  const { query, replace } = useMarks(assignment);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<MarkFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [rejection, setRejection] = useState<{ name: string; reason: PublishFailureReason }[] | null>(null);
  const canMark = assignmentPermissions(academy.role, assignment).mark;

  const students = query.data?.students;
  const term = search.trim().toLowerCase();
  const target = focus ? focusTarget(assignment, focus) : null;
  const rows = useMemo(() => (students ?? []).filter((row) => MATCHES[filter](row)
    && (!focus || !target || matchesFocus(row, focus, target.max))
    && (!term || row.fullName.toLowerCase().includes(term) || (row.studentCode ?? "").toLowerCase().includes(term))), [students, filter, term, focus, target]);

  if (assignment.state === "draft") {
    return (
      <Empty className="min-h-48 rounded-xl border border-dashed border-border py-14">
        <EmptyHeader className="gap-1">
          <EmptyMedia variant="icon"><IconUsers aria-hidden="true" /></EmptyMedia>
          <EmptyTitle>Not published yet</EmptyTitle>
          <EmptyDescription>Students are fixed from the audience when an Owner or Admin publishes the assignment.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  if (query.isPending) {
    return <div role="status" aria-label="Loading students" className="flex flex-col gap-2">{[0, 1, 2].map((key) => <Skeleton key={key} className="h-10 rounded-lg" />)}</div>;
  }
  if (query.isError || !students) {
    return (
      <Alert variant="destructive">
        <IconAlertCircle />
        <AlertTitle>Couldn’t load the students</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center gap-3">
          Check your connection and try again.
          <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>Retry</Button>
        </AlertDescription>
      </Alert>
    );
  }

  const chosen = students.filter((row) => selected.has(row.recordId) && publishable(row));
  const visiblePublishable = rows.filter(publishable);
  const allVisibleChosen = visiblePublishable.length > 0 && visiblePublishable.every((row) => selected.has(row.recordId));
  const filtering = term !== "" || filter !== "all" || focus !== null;

  function toggle(recordId: string, on: boolean) {
    setSelected((current) => { const next = new Set(current); if (on) next.add(recordId); else next.delete(recordId); return next; });
  }

  async function publish() {
    if (chosen.length === 0 || publishing) return;
    const academyId = assignment.academyId;
    const items = chosen.map((row) => ({ recordId: row.recordId, expectedVersion: row.version }));
    setPublishing(true);
    setRejection(null);
    try {
      const result = await publishStudentResults({
        academyId, assignmentId: assignment.id, items, key: attempt.keyFor(JSON.stringify(items)),
      });
      if (!isCurrentAcademy(academyId)) return;
      if (!result.ok) { toast.error(result.message); return; }
      attempt.reset();
      if (result.outcome === "rejected") {
        const names = new Map(students!.map((row) => [row.recordId, row.fullName]));
        setRejection(result.failures.map((entry) => ({ name: names.get(entry.recordId) ?? "A student", reason: entry.reason })));
        void query.refetch();
        return;
      }
      const corrected = result.results.filter((entry) => entry.outcome === "corrected").length;
      const published = result.results.filter((entry) => entry.outcome === "published").length;
      toast.success(`${published} published${corrected ? `, ${corrected} corrected` : ""}.`);
      setSelected(new Set());
      await queryClient.invalidateQueries({ queryKey: assignmentsRootKey(academyId) });
    } catch {
      if (isCurrentAcademy(academyId)) toast.error("Could not confirm the publication. Press Publish again: it won’t be applied twice.");
    } finally {
      setPublishing(false);
    }
  }

  const maxScore = formatScore(assignment.maxScore);
  const typedParts = new Set(assignment.parts.filter((part) => part.kind !== null).map((part) => part.id));
  const empty = students.length === 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <InputGroup className="sm:w-64">
            <InputGroupInput type="search" placeholder="Search by name or code" aria-label="Search students" value={search} onChange={(event) => setSearch(event.target.value)} />
            <InputGroupAddon><IconSearch /></InputGroupAddon>
          </InputGroup>
          <Select value={filter} onValueChange={(value) => setFilter(value as MarkFilter)}>
            <SelectTrigger aria-label="Filter students" className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>{FILTERS.map((entry) => <SelectItem key={entry.value} value={entry.value}>{entry.label}</SelectItem>)}</SelectContent>
          </Select>
          <FocusFilter assignment={assignment} focus={focus} onChange={onFocusChange} />
        </div>
        {canMark && (
          <Button className="shrink-0" disabled={chosen.length === 0 || publishing} onClick={() => void publish()}>
            {publishing ? "Publishing…" : chosen.length ? `Publish ${chosen.length} result${chosen.length === 1 ? "" : "s"}` : "Publish results"}
          </Button>
        )}
      </div>

      {!empty && filtering && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          <span className="font-medium text-foreground tabular-nums">{rows.length}</span> of {students.length} students
          {focus && target && <> {focus.outcome === "lost" ? "lost marks on" : "got full marks on"} <span className="font-medium text-foreground">{target.title}</span></>}
        </p>
      )}

      {rejection && (
        <Alert variant="destructive">
          <IconAlertCircle />
          <AlertTitle>Nothing was published</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">{rejection.map((entry, index) => <li key={index}>{entry.name} {REASONS[entry.reason]}.</li>)}</ul>
            Fix these students or deselect them, then publish again.
          </AlertDescription>
        </Alert>
      )}

      {empty ? (
        <Empty className="min-h-48 rounded-xl border border-dashed border-border py-14">
          <EmptyHeader className="gap-1">
            <EmptyMedia variant="icon"><IconUsers aria-hidden="true" /></EmptyMedia>
            <EmptyTitle>No students</EmptyTitle>
            <EmptyDescription>This assignment has no recipients.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : rows.length === 0 ? (
        <Empty className="min-h-48 rounded-xl border border-dashed border-border py-14">
          <EmptyHeader className="gap-1">
            <EmptyMedia variant="icon"><IconSearchOff aria-hidden="true" /></EmptyMedia>
            <EmptyTitle>No matching students</EmptyTitle>
            <EmptyDescription>{focus ? "Only students marked question by question on this part or question are counted." : filtering ? "No student matches this search and filter." : "Try a different name or code."}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent><Button size="sm" variant="outline" onClick={() => { setSearch(""); setFilter("all"); onFocusChange(null); }}>Clear search and filters</Button></EmptyContent>
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                {canMark && (
                  <TableHead className="w-10">
                    <Checkbox aria-label="Select every publishable student shown" checked={allVisibleChosen} disabled={visiblePublishable.length === 0}
                      onCheckedChange={(on) => setSelected((current) => {
                        const next = new Set(current);
                        for (const row of visiblePublishable) { if (on === true) next.add(row.recordId); else next.delete(row.recordId); }
                        return next;
                      })} />
                  </TableHead>
                )}
                <TableHead>Student</TableHead>
                <TableHead className="w-36">Work</TableHead>
                <TableHead className="w-44">Result</TableHead>
                {focus && target && <TableHead className="w-28 text-right" title={target.title}>{focus.kind === "part" ? `Part ${target.label.slice(1)}` : `Q ${target.label}`}</TableHead>}
                <TableHead className="w-32 text-right">Marks</TableHead>
                {canMark && <TableHead className="w-20"><span className="sr-only">Actions</span></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.recordId}>
                  {canMark && (
                    <TableCell>
                      <Checkbox aria-label={`Select ${row.fullName}`} checked={selected.has(row.recordId)} disabled={!publishable(row)}
                        onCheckedChange={(on) => toggle(row.recordId, on === true)} />
                    </TableCell>
                  )}
                  <TableCell>
                    <span className="font-medium">{row.fullName}</span>
                    {row.archived && <Badge variant="secondary" className="ml-2">Archived record</Badge>}
                    <span className="block text-xs text-muted-foreground">{[row.studentCode, row.groupName].filter(Boolean).join(" · ") || "No code"}</span>
                  </TableCell>
                  <TableCell><Badge variant={WORK_BADGE[row.workStatus]}>{WORK_LABELS[row.workStatus]}</Badge></TableCell>
                  <TableCell>
                    <Badge variant={RESULT_BADGE[row.publicationState]}>{RESULT_LABELS[row.publicationState]}</Badge>
                    {row.publication && <span className="block text-xs text-muted-foreground tabular-nums">Official {formatScore(row.publication.total)} · v{row.publication.revision}</span>}
                  </TableCell>
                  {focus && target && <FocusCell score={focusScore(row, focus)} max={target.max} />}
                  <TableCell className="text-right tabular-nums">
                    {row.total === null ? <span className="text-muted-foreground">—</span> : `${formatScore(row.total)} / ${maxScore}`}
                    {row.marking === "partial" && <span className="block text-xs text-muted-foreground">{row.markedParts} of {assignment.partCount} parts</span>}
                    {row.marks.some((mark) => mark.kind === "mark" && !mark.fromAnswers && typedParts.has(mark.partId)) && (
                      <span className="flex items-center justify-end gap-1 text-xs text-muted-foreground"><IconBolt className="size-3" aria-hidden="true" />Fast marked</span>
                    )}
                  </TableCell>
                  {canMark && (
                    <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => setEditing(row.recordId)}>Edit</Button></TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <StudentSheet assignment={assignment} student={students.find((row) => row.recordId === editing) ?? null}
        onClose={() => setEditing(null)} onChanged={replace} />
    </div>
  );
}

/** The student's score on the focused part or question, red when marks were lost. */
function FocusCell({ score, max }: { score: number | null; max: number }) {
  return (
    <TableCell className="text-right tabular-nums">
      {score === null ? <span className="text-muted-foreground">—</span> : (
        <span className={score < max ? "font-medium text-destructive" : "font-medium"}>
          {formatScore(score)}<span className="font-normal text-muted-foreground"> / {formatScore(max)}</span>
        </span>
      )}
    </TableCell>
  );
}
