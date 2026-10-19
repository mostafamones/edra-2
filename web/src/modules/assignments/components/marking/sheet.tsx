"use client";

import { MarkingSheet } from "@/components/shared/assessment/marking/sheet";
import { formatScore } from "@/lib/score";
import { useMarks } from "../../hooks/use-marks";
import type { Assignment, StudentWork } from "../../types";
import { AssignmentMarks } from "./form";

const STATE_LABELS: Record<StudentWork["marking"], string> = { unmarked: "Not marked", partial: "Partly marked", complete: "Marked" };

/** The marking flow of the assignment, on the shared sheet. */
export function AssignmentMarking({ assignment }: { assignment: Assignment }) {
  const { query, replace } = useMarks(assignment);
  return (
    <MarkingSheet
      roster={{ isPending: query.isPending, isError: query.isError, rows: query.data?.students ?? [] }}
      summary={(row) => (row.total === null ? STATE_LABELS[row.marking] : `${formatScore(row.total)} / ${formatScore(assignment.maxScore)}`)}
      form={(student, { onSaved }) => (
        <AssignmentMarks key={`${student.recordId}-${student.version}`} assignment={assignment} student={student} onChanged={replace} onSaved={onSaved} />
      )}
    />
  );
}
