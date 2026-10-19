"use client";

import { StatStrip } from "@/components/shared/assessment/workspace/stats";
import { PartsCard, type PartRow } from "@/components/shared/assessment/workspace/parts";
import { TopStudents } from "@/components/shared/assessment/workspace/top";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MarkFocus } from "../../../focus";
import { useMarks } from "../../../hooks/use-marks";
import { formatScore } from "../../../score";
import type { Assignment } from "../../../types";
import { countLabel, PART_ISSUE_LABELS, PART_KIND_ICONS, PART_KIND_LABELS } from "../../shared/labels";
import { MarkAnalytics } from "./chart";

const number = new Intl.NumberFormat("en");
const percent = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });

/** Total marks, students, marking progress, and the average score. */
function Stats({ assignment }: { assignment: Assignment }) {
  const { query } = useMarks(assignment);
  const loading = query.isPending;
  const students = query.data?.students ?? [];
  const marked = students.filter((row) => row.marking === "complete").length;
  const totals = students.filter((row) => row.marking === "complete" && row.total !== null).map((row) => Number(row.total));
  const max = Number(assignment.maxScore);
  const average = totals.length > 0 && max > 0 ? (totals.reduce((sum, total) => sum + total, 0) / totals.length / max) * 100 : null;
  const recipients = assignment.recipientCount;
  return (
    <StatStrip stats={[
      { label: "Total marks", value: formatScore(assignment.maxScore) },
      { label: "Students", value: number.format(recipients) },
      { label: "Marked", loading, value: <>{number.format(marked)}<span className="text-base font-medium text-muted-foreground"> / {number.format(recipients)}</span></> },
      { label: "Average", loading, value: average === null ? "—" : `${percent.format(average)}%` },
    ]} />
  );
}

function partRows(assignment: Assignment): PartRow[] {
  return assignment.parts.map((part) => {
    const kind = part.kind ?? "legacy";
    return {
      id: part.id, position: part.position, title: part.title, Icon: PART_KIND_ICONS[kind], maxScore: part.maxScore,
      detail: `${PART_KIND_LABELS[kind]}${part.kind ? ` · ${countLabel(part.kind, part.questions.length)}` : ""}`,
      issues: part.issues.map((issue) => PART_ISSUE_LABELS[issue]),
    };
  });
}

/** The stat strip and marks chart, then the parts beside the top students. */
type Props = {
  assignment: Assignment;
  onViewStudents: () => void;
  /** A chart bar was selected: show the students who lost marks on it. */
  onSelectBar: (target: Pick<MarkFocus, "kind" | "id">) => void;
};

export function AssignmentOverview({ assignment, onViewStudents, onSelectBar }: Props) {
  const { query } = useMarks(assignment);
  const scored = query.isPending ? undefined : (query.data?.students ?? []).filter((row) => row.total !== null)
    .map((row) => ({ id: row.recordId, name: row.fullName, code: row.studentCode, total: row.total!, complete: row.marking === "complete" }));
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

      {!assignment.ready ? <PartsCard parts={partRows(assignment)} /> : (
        <div className="grid items-stretch gap-4 lg:grid-cols-2">
          <PartsCard parts={partRows(assignment)} />
          <TopStudents students={scored} maxScore={assignment.maxScore} onViewAll={onViewStudents} />
        </div>
      )}
    </div>
  );
}
