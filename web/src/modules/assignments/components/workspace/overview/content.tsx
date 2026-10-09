"use client";

import type { ReactNode } from "react";
import { IconAlertTriangle } from "@tabler/icons-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import type { MarkFocus } from "../../../focus";
import { formatScore } from "../../../score";
import type { Assignment, AssignmentPart } from "../../../types";
import { MarkAnalytics } from "./chart";
import { TopStudents } from "./top-students";
import { countLabel, PART_ISSUE_LABELS, PART_KIND_ICONS, PART_KIND_LABELS } from "../../shared/labels";
import { useMarks } from "../../../hooks/use-marks";

const number = new Intl.NumberFormat("en");
const percent = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });

/** One cell of the stat strip: a label, a large value, and a one-line note (always present so cells align). */
function Stat({ label, value, note, loading }: { label: string; value: ReactNode; note?: ReactNode; loading?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-card px-5 py-4">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {loading ? <Skeleton className="my-1 h-6 w-16" /> : <span className="truncate font-heading text-2xl font-semibold tracking-tight tabular-nums">{value}</span>}
      {note && <div className="min-h-4 truncate text-xs text-muted-foreground">{note}</div>}
    </div>
  );
}

/** Total marks, students, marking progress, and the average score, in one divided strip. */
function Stats({ assignment }: { assignment: Assignment }) {
  const { query } = useMarks(assignment);
  const draft = assignment.state === "draft";
  const loading = !draft && query.isPending;
  const students = query.data?.students ?? [];
  const marked = students.filter((row) => row.marking === "complete").length;
  const partly = students.filter((row) => row.marking === "partial").length;
  const totals = students.filter((row) => row.marking === "complete" && row.total !== null).map((row) => Number(row.total));
  const max = Number(assignment.maxScore);
  const average = totals.length > 0 && max > 0 ? (totals.reduce((sum, total) => sum + total, 0) / totals.length / max) * 100 : null;
  const recipients = assignment.recipientCount;

  return (
    // The 1px gap over a border-coloured card draws the dividers, whatever the column count.
    <Card className="grid grid-cols-2 gap-px bg-border py-0 lg:grid-cols-4">
      <Stat label="Total marks" value={formatScore(assignment.maxScore)} />
      <Stat label="Students" value={draft ? "—" : number.format(recipients)} />
      <Stat label="Marked" loading={loading}
        value={draft ? "—" : <>{number.format(marked)}<span className="text-base font-medium text-muted-foreground"> / {number.format(recipients)}</span></>}
      />
      <Stat label="Average" loading={loading} value={average === null ? "—" : `${percent.format(average)}%`} />
    </Card>
  );
}

/** One part as a list row: its type, size, marks, and (on drafts) what still blocks publishing. */
function PartRow({ part, draft }: { part: AssignmentPart; draft: boolean }) {
  const kind = part.kind ?? "legacy";
  const Icon = PART_KIND_ICONS[kind];
  const issues = draft ? part.issues : [];
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4.5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            <span className="mr-2 text-muted-foreground tabular-nums">{part.position}.</span>{part.title}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {PART_KIND_LABELS[kind]}{part.kind && ` · ${countLabel(part.kind, part.questions.length)}`}
          </p>
        </div>
        <p className="shrink-0 text-right text-sm tabular-nums">
          <span className="font-semibold">{formatScore(part.maxScore)}</span>
          <span className="text-muted-foreground"> marks</span>
        </p>
      </div>
      {issues.length > 0 && (
        <ul className="flex flex-col gap-1 pl-12 text-xs text-amber-600 dark:text-amber-400">
          {issues.map((issue) => (
            <li key={issue} className="flex items-center gap-1.5">
              <IconAlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="first-letter:uppercase">{PART_ISSUE_LABELS[issue]}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Parts({ assignment, draft }: { assignment: Assignment; draft: boolean }) {
  return (
    <Card className="h-full gap-0 pb-0">
      <CardHeader className="border-b pb-3!">
        <CardTitle>Parts</CardTitle>
      </CardHeader>
      <ol className="flex flex-col divide-y border-b">
        {assignment.parts.map((part) => <PartRow key={part.id} part={part} draft={draft} />)}
      </ol>
    </Card>
  );
}

/** The stat strip and marks chart, then the parts beside the top students. */
type Props = {
  assignment: Assignment;
  onViewStudents: () => void;
  /** A chart bar was selected: show the students who lost marks on it. */
  onSelectBar: (target: Pick<MarkFocus, "kind" | "id">) => void;
};

export function AssignmentOverview({ assignment, onViewStudents, onSelectBar }: Props) {
  const draft = assignment.state === "draft";
  return (
    <div className="flex flex-col gap-4">
      <Stats assignment={assignment} />

      {assignment.instructions && (
        <Card>
          <CardHeader>
            <CardTitle>Instructions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">{assignment.instructions}</p>
          </CardContent>
        </Card>
      )}

      <MarkAnalytics assignment={assignment} onSelect={onSelectBar} />

      {draft ? <Parts assignment={assignment} draft /> : (
        <div className="grid items-stretch gap-4 lg:grid-cols-2">
          <Parts assignment={assignment} draft={false} />
          <TopStudents assignment={assignment} onViewAll={onViewStudents} />
        </div>
      )}
    </div>
  );
}
