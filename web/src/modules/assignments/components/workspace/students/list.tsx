"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { IconAlertCircle, IconBolt, IconSearch, IconSearchOff, IconUsers, IconX } from "@tabler/icons-react";

import { FilterPopover, type FilterField } from "@/components/shared/filter-popover";
import { SortPopover } from "@/components/shared/sort-popover";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAcademyScope } from "@/modules/auth";
import { announceStudentResults } from "../../../actions";
import { focusScore, focusTarget, matchesFocus, type MarkFocus } from "../../../focus";
import { assignmentPermissions } from "../../../permissions";
import { assignmentsRootKey } from "../../../queries";
import { formatScore } from "../../../score";
import type { Assignment, MarkFilter, PublishFailureReason, StudentSort, StudentWork } from "../../../types";
import { FocusFilter } from "./focus";
import { StudentsPagination } from "./pagination";
import { RESULT_BADGE, RESULT_LABELS, WORK_BADGE, WORK_LABELS } from "../../shared/labels";
import { StudentSheet } from "../../marking/student";
import { useAttemptKey, useMarks } from "../../../hooks/use-marks";
import type { AcademyEntry } from "@/modules/academies";

const FILTERS: { value: MarkFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "not_received", label: "Not received" },
  { value: "needs_marking", label: "Needs marking" },
  { value: "marked", label: "Marked" },
  { value: "unpublished", label: "Ready to announce" },
];

const MATCHES: Record<MarkFilter, (row: StudentWork) => boolean> = {
  all: () => true,
  not_received: (row) => row.workStatus === "expected" || row.workStatus === "missing",
  needs_marking: (row) => (row.workStatus === "submitted" || row.workStatus === "late") && row.marking !== "complete",
  marked: (row) => row.marking === "complete",
  unpublished: (row) => row.marking === "complete" && row.publicationState !== "published",
};

const PAGE_SIZE = 10;

const SORTS: { value: StudentSort; label: string }[] = [
  { value: "default", label: "Name (A–Z)" },
  { value: "marks_desc", label: "Highest marks" },
  { value: "marked_desc", label: "Most recently marked" },
];

/** Students with nothing marked always sort last, so the order stays about marked work. */
const COMPARE: Record<Exclude<StudentSort, "default">, (a: StudentWork, b: StudentWork) => number> = {
  marks_desc: (a, b) => (a.total === null ? 1 : 0) - (b.total === null ? 1 : 0) || Number(b.total ?? 0) - Number(a.total ?? 0),
  marked_desc: (a, b) => (a.markedParts === 0 ? 1 : 0) - (b.markedParts === 0 ? 1 : 0) || (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
};

const REASONS: Record<PublishFailureReason, string> = {
  not_recipient: "isn’t a recipient",
  stale: "changed since you loaded the list",
  incomplete: "has parts that aren’t marked yet",
};

/** A student's result can be announced once every part has a mark and it differs from what was announced. */
const announceable = (row: StudentWork) => row.marking === "complete" && row.publicationState !== "published";

type Props = { academy: AcademyEntry; assignment: Assignment; focus: MarkFocus | null; onFocusChange: (focus: MarkFocus | null) => void };

/**
 * The students of the assignment: work status, marks, totals, and per-student result announcement. A
 * part or question focus (also set from the marks chart) narrows it to who lost or kept those marks.
 */
export function AssignmentStudents({ academy, assignment, focus, onFocusChange }: Props) {
  const queryClient = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  const attempt = useAttemptKey();
  const { query, replace } = useMarks(assignment);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<MarkFilter>("all");
  const [group, setGroup] = useState("all");
  const [track, setTrack] = useState("all");
  const [sort, setSort] = useState<StudentSort>("default");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [announcing, setAnnouncing] = useState(false);
  const [rejection, setRejection] = useState<{ name: string; reason: PublishFailureReason }[] | null>(null);
  const permissions = assignmentPermissions(academy.role, assignment);
  const canMark = permissions.mark;

  const students = query.data?.students;
  const term = search.trim().toLowerCase();
  const target = focus ? focusTarget(assignment, focus) : null;
  const rows = useMemo(() => {
    const matching = (students ?? []).filter((row) => MATCHES[filter](row)
    && (group === "all" || (group === "none" ? row.placement?.groupId === null : row.placement?.groupId === group))
    && (track === "all" || (track === "none" ? row.placement?.trackId === null : row.placement?.trackId === track))
    && (!focus || !target || matchesFocus(row, focus, target.max))
    && (!term || row.fullName.toLowerCase().includes(term) || (row.studentCode ?? "").toLowerCase().includes(term)));
    return sort === "default" ? matching : matching.sort(COMPARE[sort]);
  }, [students, filter, group, track, term, focus, target, sort]);

  // Any change to the search, filters, or focus returns to the first page.
  const filterKey = JSON.stringify([term, filter, group, track, focus, sort]);
  const [pagedKey, setPagedKey] = useState(filterKey);
  const [page, setPage] = useState(0);
  if (pagedKey !== filterKey) { setPagedKey(filterKey); setPage(0); }
  const pageIndex = Math.min(page, Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1));
  const pageRows = rows.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE);

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

  const chosen = students.filter((row) => selected.has(row.recordId) && announceable(row));
  const visibleAnnounceable = rows.filter(announceable);
  const allVisibleChosen = visibleAnnounceable.length > 0 && visibleAnnounceable.every((row) => selected.has(row.recordId));
  const filtering = term !== "" || filter !== "all" || group !== "all" || track !== "all" || focus !== null;

  function toggle(recordId: string, on: boolean) {
    setSelected((current) => { const next = new Set(current); if (on) next.add(recordId); else next.delete(recordId); return next; });
  }

  async function announce() {
    if (chosen.length === 0 || announcing) return;
    const academyId = assignment.academyId;
    const items = chosen.map((row) => ({ recordId: row.recordId, expectedVersion: row.version }));
    setAnnouncing(true);
    setRejection(null);
    try {
      const result = await announceStudentResults({
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
      const announced = result.results.filter((entry) => entry.outcome === "published").length;
      toast.success(`${announced} announced${corrected ? `, ${corrected} corrected` : ""}.`);
      setSelected(new Set());
      await queryClient.invalidateQueries({ queryKey: assignmentsRootKey(academyId) });
    } catch {
      if (isCurrentAcademy(academyId)) toast.error("Could not confirm the announcement. Press Announce again: it won’t be applied twice.");
    } finally {
      setAnnouncing(false);
    }
  }

  const maxScore = formatScore(assignment.maxScore);
  const typedParts = new Set(assignment.parts.filter((part) => part.kind !== null).map((part) => part.id));
  const empty = students.length === 0;
  const groups = new Map(students.flatMap((row) => row.placement?.groupId
    ? [[row.placement.groupId, row.groupName ?? "Unnamed group"] as const] : []));
  const tracks = new Map(students.flatMap((row) => row.placement?.trackId
    ? [[row.placement.trackId, row.placement.trackName ?? "Unnamed track"] as const] : []));
  const options = (values: Map<string, string>) => [...values].map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const fields: FilterField[] = [
    { id: "status", label: "Status", value: filter, defaultValue: "all", options: FILTERS,
      onChange: (value) => setFilter(value as MarkFilter) },
    { id: "group", label: "Group", value: group, defaultValue: "all",
      options: [{ value: "all", label: "All groups" }, ...options(groups),
        ...(students.some((row) => row.placement?.groupId === null) ? [{ value: "none", label: "No group" }] : [])],
      onChange: setGroup },
    ...(tracks.size > 0 ? [{ id: "track", label: "Track", value: track, defaultValue: "all",
      options: [{ value: "all", label: "All tracks" }, ...options(tracks),
        ...(students.some((row) => row.placement?.trackId === null) ? [{ value: "none", label: "No track" }] : [])],
      onChange: setTrack }] : []),
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <InputGroup className="w-full sm:min-w-0 sm:max-w-lg sm:flex-1">
          <InputGroupInput type="search" placeholder="Search students" aria-label="Search students" value={search} onChange={(event) => setSearch(event.target.value)} />
          <InputGroupAddon><IconSearch /></InputGroupAddon>
        </InputGroup>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {focus && target && <FocusFilter focus={focus} onChange={onFocusChange} />}
          <FilterPopover iconOnly fields={fields} />
          <SortPopover value={sort} defaultValue="default" options={SORTS} onChange={(value) => setSort(value as StudentSort)} />
          {canMark && (
            <Button className="shrink-0" disabled={chosen.length === 0 || announcing} onClick={() => void announce()}>
              {announcing ? "Announcing…" : chosen.length ? `Announce ${chosen.length} result${chosen.length === 1 ? "" : "s"}` : "Announce results"}
            </Button>
          )}
        </div>
      </div>

      {!empty && filtering && (
        <div className="flex flex-col items-start gap-2">
          {focus && target && (
            <Badge variant="secondary" className="max-w-full gap-1 pl-2.5" title={target.title}>
              <span className="truncate">{target.title}</span>
              <Button variant="ghost" size="icon-sm" className="size-6" aria-label="Clear part or question filter" onClick={() => onFocusChange(null)}><IconX /></Button>
            </Badge>
          )}
        </div>
      )}

      {rejection && (
        <Alert variant="destructive">
          <IconAlertCircle />
          <AlertTitle>Nothing was announced</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">{rejection.map((entry, index) => <li key={index}>{entry.name} {REASONS[entry.reason]}.</li>)}</ul>
            Fix these students or deselect them, then announce again.
          </AlertDescription>
        </Alert>
      )}

      {empty ? (
        <Empty className="min-h-48 rounded-xl border border-dashed border-border py-14">
          <EmptyHeader className="gap-1">
            <EmptyMedia variant="icon"><IconUsers aria-hidden="true" /></EmptyMedia>
            <EmptyTitle>No students</EmptyTitle>
            <EmptyDescription>
              {permissions.editStructure
                ? "No active students matched its audience when it was last saved. Saving it again adds students who have joined since."
                : "This assignment has no students."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : rows.length === 0 ? (
        <Empty className="min-h-48 rounded-xl border border-dashed border-border py-14">
          <EmptyHeader className="gap-1">
            <EmptyMedia variant="icon"><IconSearchOff aria-hidden="true" /></EmptyMedia>
            <EmptyTitle>No matching students</EmptyTitle>
            <EmptyDescription>{focus ? (focus.outcome === "unmarked" ? "Every student has a question-level mark on this part or question, or no student matches the other filters." : "Only students marked question by question on this part or question are counted.") : filtering ? "No student matches this search and filter." : "Try a different name or code."}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent><Button size="sm" variant="outline" onClick={() => { setSearch(""); setFilter("all"); setGroup("all"); setTrack("all"); onFocusChange(null); }}>Clear search and filters</Button></EmptyContent>
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                {canMark && (
                  <TableHead className="w-10">
                    <Checkbox aria-label="Select every student shown whose result can be announced" checked={allVisibleChosen} disabled={visibleAnnounceable.length === 0}
                      onCheckedChange={(on) => setSelected((current) => {
                        const next = new Set(current);
                        for (const row of visibleAnnounceable) { if (on === true) next.add(row.recordId); else next.delete(row.recordId); }
                        return next;
                      })} />
                  </TableHead>
                )}
                <TableHead className="w-28">Code</TableHead>
                <TableHead>Student</TableHead>
                <TableHead className="w-36">Work</TableHead>
                <TableHead className="w-44">Result</TableHead>
                {focus && target && <TableHead className="w-28 text-right" title={target.title}>{focus.kind === "part" ? `Part ${target.label.slice(1)}` : `Q ${target.label}`}</TableHead>}
                <TableHead className="w-32 text-right">Marks</TableHead>
                {canMark && <TableHead className="w-20"><span className="sr-only">Actions</span></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((row) => (
                <TableRow key={row.recordId}>
                  {canMark && (
                    <TableCell>
                      <Checkbox aria-label={`Select ${row.fullName}`} checked={selected.has(row.recordId)} disabled={!announceable(row)}
                        onCheckedChange={(on) => toggle(row.recordId, on === true)} />
                    </TableCell>
                  )}
                  <TableCell className="font-mono text-muted-foreground">{row.studentCode ?? "—"}</TableCell>
                  <TableCell>
                    <span className="font-medium">{row.fullName}</span>
                    {row.archived && <Badge variant="secondary" className="ml-2">Archived record</Badge>}
                    {row.groupName && <span className="block text-xs text-muted-foreground">{row.groupName}</span>}
                  </TableCell>
                  <TableCell><Badge variant={WORK_BADGE[row.workStatus]}>{WORK_LABELS[row.workStatus]}</Badge></TableCell>
                  <TableCell>
                    <Badge variant={RESULT_BADGE[row.publicationState]}>{RESULT_LABELS[row.publicationState]}</Badge>
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

      {rows.length > PAGE_SIZE && <StudentsPagination pageIndex={pageIndex} pageSize={PAGE_SIZE} total={rows.length} onPageChange={setPage} />}

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
