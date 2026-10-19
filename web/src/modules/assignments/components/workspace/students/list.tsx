"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { IconBolt, IconX } from "@tabler/icons-react";

import { StudentsTable, type AnnounceSpec, type FilterSpec, type SortSpec, type StudentColumn } from "@/components/shared/assessment/workspace/students";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AcademyEntry } from "@/modules/academies";
import { useAcademyScope } from "@/modules/auth";
import { announceStudentResults } from "../../../actions";
import { focusScore, focusTarget, matchesFocus, type MarkFocus } from "../../../focus";
import { isRequiredNotReceived, requirementLabel } from "../../../eligibility";
import { useMarks } from "../../../hooks/use-marks";
import { assignmentPermissions } from "../../../permissions";
import { assignmentsRootKey } from "../../../queries";
import { formatScore } from "../../../score";
import type { Assignment, MarkFilter, PublishFailureReason, StudentSort, StudentWork } from "../../../types";
import { StudentMarkSheet } from "@/components/shared/assessment/marking/student";
import { AssignmentMarks } from "../../marking/form";
import { RESULT_BADGE, RESULT_LABELS, WORK_BADGE, WORK_LABELS } from "../../shared/labels";
import { FocusFilter } from "./focus";

const STATUSES: { value: MarkFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "not_received", label: "Required · Not received" },
  { value: "needs_marking", label: "Needs marking" },
  { value: "marked", label: "Marked" },
  { value: "unpublished", label: "Ready to announce" },
];

const MATCHES: Record<MarkFilter, (row: StudentWork) => boolean> = {
  all: () => true,
  not_received: isRequiredNotReceived,
  needs_marking: (row) => (row.workStatus === "submitted" || row.workStatus === "late") && row.marking !== "complete",
  marked: (row) => row.marking === "complete",
  unpublished: (row) => row.marking === "complete" && row.publicationState !== "published",
};

const SORT: SortSpec<StudentWork> = {
  defaultValue: "default",
  options: [
    { value: "default", label: "Name (A–Z)" },
    { value: "marks_desc", label: "Highest marks" },
    { value: "marked_desc", label: "Most recently marked" },
  ] satisfies { value: StudentSort; label: string }[],
  // Students with nothing marked always sort last, so the order stays about marked work.
  compare: {
    marks_desc: (a, b) => (a.total === null ? 1 : 0) - (b.total === null ? 1 : 0) || Number(b.total ?? 0) - Number(a.total ?? 0),
    marked_desc: (a, b) => (a.markedParts === 0 ? 1 : 0) - (b.markedParts === 0 ? 1 : 0) || (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
  },
};

const REASONS: Record<PublishFailureReason, string> = {
  not_recipient: "isn’t a recipient",
  stale: "changed since you loaded the list",
  incomplete: "has parts that aren’t marked yet",
};

/** A student's result can be announced once every part has a mark and it differs from what was announced. */
const announceable = (row: StudentWork) => row.marking === "complete" && row.publicationState !== "published";

const options = (values: Map<string, string>) => [...values].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));

function filters(rows: StudentWork[]): FilterSpec<StudentWork>[] {
  const groups = new Map(rows.flatMap((row) => row.placement?.groupId ? [[row.placement.groupId, row.groupName ?? "Unnamed group"] as const] : []));
  const tracks = new Map(rows.flatMap((row) => row.placement?.trackId ? [[row.placement.trackId, row.placement.trackName ?? "Unnamed track"] as const] : []));
  return [
    { id: "status", label: "Status", defaultValue: "all", options: STATUSES, match: (row, value) => MATCHES[value as MarkFilter](row) },
    { id: "requirement", label: "Requirement", defaultValue: "all",
      options: [{ value: "all", label: "All requirements" }, { value: "Required", label: "Required" }, { value: "Optional", label: "Optional" }, { value: "Requirement ended", label: "Requirement ended" }],
      match: (row, value) => requirementLabel(row) === value },
    {
      id: "group", label: "Group", defaultValue: "all",
      options: [{ value: "all", label: "All groups" }, ...options(groups), ...(rows.some((row) => row.placement?.groupId === null) ? [{ value: "none", label: "No group" }] : [])],
      match: (row, value) => (value === "none" ? row.placement?.groupId === null : row.placement?.groupId === value),
    },
    ...(tracks.size > 0 ? [{
      id: "track", label: "Track", defaultValue: "all",
      options: [{ value: "all", label: "All tracks" }, ...options(tracks), ...(rows.some((row) => row.placement?.trackId === null) ? [{ value: "none", label: "No track" }] : [])],
      match: (row: StudentWork, value: string) => (value === "none" ? row.placement?.trackId === null : row.placement?.trackId === value),
    }] : []),
  ];
}

type Props = { academy: AcademyEntry; assignment: Assignment; focus: MarkFocus | null; onFocusChange: (focus: MarkFocus | null) => void };

/**
 * The students of the assignment: work status, marks, totals, and per-student result announcement. A
 * part or question focus (also set from the marks chart) narrows it to who lost or kept those marks.
 */
export function AssignmentStudents({ academy, assignment, focus, onFocusChange }: Props) {
  const queryClient = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  const { query, replace } = useMarks(assignment);
  const [editing, setEditing] = useState<string | null>(null);
  const permissions = assignmentPermissions(academy.role, assignment);
  const canMark = permissions.mark;
  const students = query.data?.students;

  const target = useMemo(() => (focus ? focusTarget(assignment, focus) : null), [assignment, focus]);
  const scope = useMemo(() => (focus && target ? {
    key: focus,
    match: (row: StudentWork) => matchesFocus(row, focus, target.max),
    chip: (
      <Badge variant="secondary" className="max-w-full gap-1 pl-2.5" title={target.title}>
        <span className="truncate">{target.title}</span>
        <Button variant="ghost" size="icon-sm" className="size-6" aria-label="Clear part or question filter" onClick={() => onFocusChange(null)}><IconX /></Button>
      </Badge>
    ),
  } : undefined), [focus, target, onFocusChange]);

  const typedParts = new Set(assignment.parts.filter((part) => part.kind !== null).map((part) => part.id));
  const maxScore = formatScore(assignment.maxScore);
  const columns: StudentColumn<StudentWork>[] = [
    { id: "requirement", head: "Requirement", className: "w-40", cell: (row) => <Badge variant="outline">{requirementLabel(row)}</Badge> },
    { id: "work", head: "Work", className: "w-36", cell: (row) => <Badge variant={WORK_BADGE[row.workStatus]}>{WORK_LABELS[row.workStatus]}</Badge> },
    { id: "result", head: "Result", className: "w-44", cell: (row) => <Badge variant={RESULT_BADGE[row.publicationState]}>{RESULT_LABELS[row.publicationState]}</Badge> },
    ...(focus && target ? [{
      id: "focus", className: "w-28 text-right", head: <span title={target.title}>{focus.kind === "part" ? `Part ${target.label.slice(1)}` : `Q ${target.label}`}</span>,
      cell: (row: StudentWork) => <FocusCell score={focusScore(row, focus)} max={target.max} />,
    }] : []),
    {
      id: "marks", head: "Marks", className: "w-32 text-right tabular-nums",
      cell: (row) => (
        <>
          {row.total === null ? <span className="text-muted-foreground">—</span> : `${formatScore(row.total)} / ${maxScore}`}
          {row.marking === "partial" && <span className="block text-xs text-muted-foreground">{row.markedParts} of {assignment.partCount} parts</span>}
          {row.marks.some((mark) => mark.kind === "mark" && !mark.fromAnswers && typedParts.has(mark.partId)) && (
            <span className="flex items-center justify-end gap-1 text-xs text-muted-foreground"><IconBolt className="size-3" aria-hidden="true" />Fast marked</span>
          )}
        </>
      ),
    },
  ];

  const announce: AnnounceSpec<StudentWork> | undefined = canMark ? {
    reasons: REASONS, announceable, version: (row) => row.version,
    run: async (items, key) => {
      const academyId = assignment.academyId;
      const result = await announceStudentResults({ academyId, assignmentId: assignment.id, items, key });
      if (!isCurrentAcademy(academyId)) return { ok: true, outcome: "done", message: "" };
      if (!result.ok) return { ok: false, message: result.message };
      if (result.outcome === "rejected") {
        void query.refetch();
        return { ok: true, outcome: "rejected", failures: result.failures };
      }
      const corrected = result.results.filter((entry) => entry.outcome === "corrected").length;
      const announced = result.results.filter((entry) => entry.outcome === "published").length;
      await queryClient.invalidateQueries({ queryKey: assignmentsRootKey(academyId) });
      return { ok: true, outcome: "done", message: `${announced} announced${corrected ? `, ${corrected} corrected` : ""}.` };
    },
  } : undefined;

  return (
    <>
      <StudentsTable
        query={query} rows={students} filters={filters} sort={SORT} scope={scope} columns={columns} announce={announce}
        toolbar={focus && target ? <FocusFilter focus={focus} onChange={onFocusChange} /> : undefined}
        actions={canMark ? (row) => <Button size="sm" variant="ghost" onClick={() => setEditing(row.recordId)}>Edit</Button> : undefined}
        emptyText="This assignment has no matching students or recorded work."
        noMatchText={focus ? (focus.outcome === "unmarked"
          ? "Every student has a question-level mark on this part or question, or no student matches the other filters."
          : "Only students marked question by question on this part or question are counted.") : undefined}
        onClear={() => onFocusChange(null)}
      />
      <StudentMarkSheet student={students?.find((row) => row.recordId === editing) ?? null} onClose={() => setEditing(null)}
        form={(student, { onSaved }) => <AssignmentMarks key={student.version} assignment={assignment} student={student} onChanged={replace} onSaved={onSaved} />} />
    </>
  );
}

/** The student's score on the focused part or question, red when marks were lost. */
function FocusCell({ score, max }: { score: number | null; max: number }) {
  return score === null ? <span className="text-muted-foreground">—</span> : (
    <span className={score < max ? "font-medium text-destructive" : "font-medium"}>
      {formatScore(score)}<span className="font-normal text-muted-foreground"> / {formatScore(max)}</span>
    </span>
  );
}
