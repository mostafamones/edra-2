"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { StudentMarkSheet } from "@/components/shared/assessment/marking/student";
import { StudentsTable, type AnnounceSpec, type FilterSpec, type StudentColumn } from "@/components/shared/assessment/workspace/students";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatScore } from "@/lib/score";
import type { AcademyEntry } from "@/modules/academies";
import { useAcademyScope } from "@/modules/auth";
import { announceExamResults } from "../../actions";
import { announceable, type ExamPermissions } from "../../permissions";
import { loadExamStudents, examStudentsQueryKey, examsRootKey } from "../../queries";
import { STATUS_FILTERS, studentStatus, type StatusFilter } from "../../status";
import type { AnnounceFailureReason, Exam, ExamStudent } from "../../types";
import { ExamMarks } from "../marking/form";
import { REASON_LABELS, STATUS_BADGE, STATUS_LABELS } from "../shared/labels";
import { StudentDetails } from "./details";

const REASONS: Record<AnnounceFailureReason, string> = {
  not_submitted: "has no accepted work",
  stale: "changed since you loaded the list",
  incomplete: "has written questions that aren’t marked",
};

const filters = (): FilterSpec<ExamStudent>[] => [{
  id: "status", label: "Status", defaultValue: "all",
  options: STATUS_FILTERS.map((value) => ({ value, label: value === "all" ? "All statuses" : STATUS_LABELS[value] })),
  match: (row, value) => studentStatus(row) === (value as StatusFilter),
}];

type Props = { academy: AcademyEntry; exam: Exam; permissions: ExamPermissions };

/**
 * Everyone currently in the audience plus every student who has work, even after leaving it. Staff mark
 * a student on the shared marking sheet or open their details; complete results can be announced for
 * selected students at once (no whole-cohort requirement).
 */
export function ExamStudents({ academy, exam, permissions }: Props) {
  const queryClient = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  const query = useQuery({ queryKey: examStudentsQueryKey(academy.id, exam.id), queryFn: () => loadExamStudents(academy.id, exam.id), refetchInterval: 30_000 });
  const [marking, setMarking] = useState<string | null>(null);
  const [details, setDetails] = useState<string | null>(null);
  const students = query.data;
  const maxScore = formatScore(exam.effectiveMaxScore);

  const columns: StudentColumn<ExamStudent>[] = [
    {
      id: "status", head: "Status", className: "w-48",
      cell: (row) => {
        const status = studentStatus(row);
        return (
          <>
            <Badge variant={STATUS_BADGE[status]}>{STATUS_LABELS[status]}</Badge>
            {row.submission && <span className="mt-0.5 block text-xs text-muted-foreground">{REASON_LABELS[row.submission.reason]}</span>}
          </>
        );
      },
    },
    {
      id: "result", head: "Current result", className: "w-36 text-right tabular-nums",
      cell: (row) => row.result ? (
        <>
          {row.result.complete ? `${formatScore(row.result.total)} / ${maxScore}` : <span className="text-muted-foreground">Incomplete</span>}
          {row.result.required > 0 && <span className="block text-xs text-muted-foreground">{row.result.marked} of {row.result.required} marked</span>}
        </>
      ) : <span className="text-muted-foreground">—</span>,
    },
    {
      id: "announced", head: "Announced", className: "w-36 text-right tabular-nums",
      cell: (row) => (
        <>
          {row.publication ? `${formatScore(row.publication.total)} / ${formatScore(row.publication.maxScore)}` : <span className="text-muted-foreground">—</span>}
          {row.publication && row.publication.revision > 1 && <span className="block text-xs text-muted-foreground">Revision {row.publication.revision}</span>}
        </>
      ),
    },
  ];

  const announce: AnnounceSpec<ExamStudent> | undefined = permissions.mark ? {
    reasons: REASONS, announceable, version: (row) => row.version, basis: exam.scoringRevision,
    run: async (items, key) => {
      const result = await announceExamResults({ academyId: academy.id, examId: exam.id, expectedScoringRevision: exam.scoringRevision, items, key });
      void queryClient.invalidateQueries({ queryKey: examsRootKey(academy.id) });
      if (!isCurrentAcademy(academy.id)) return { ok: true, outcome: "done", message: "" };
      if (!result.ok) return { ok: false, message: result.message };
      if (result.outcome === "rejected") return { ok: true, outcome: "rejected", failures: result.failures };
      const changed = result.results.filter((entry) => entry.outcome !== "unchanged").length;
      return { ok: true, outcome: "done", message: changed === 0 ? "These results were already announced." : `${changed} result${changed === 1 ? "" : "s"} announced.` };
    },
  } : undefined;

  return (
    <>
      <StudentsTable
        query={query} rows={students} filters={filters} columns={columns} announce={announce}
        badges={(row) => !row.eligible && <Badge variant="outline" className="ml-2">Not in audience now</Badge>}
        actions={(row) => (
          <>
            {permissions.mark && (row.submission !== null || (permissions.enterWork && row.eligible)) && <Button size="sm" variant="ghost" onClick={() => setMarking(row.recordId)}>Mark</Button>}
            <Button size="sm" variant="ghost" onClick={() => setDetails(row.recordId)}>Details</Button>
          </>
        )}
        emptyText={exam.audience === null ? "Choose who the exam is for in its setup." : "No active student matches the audience yet. Students who join it later appear here."}
      />
      <StudentMarkSheet student={students?.find((row) => row.recordId === marking) ?? null} onClose={() => setMarking(null)}
        form={(student, { onSaved }) => <ExamMarks key={student.version} academy={academy} exam={exam} student={student} onSaved={onSaved} />} />
      <StudentDetails academy={academy} exam={exam} recordId={details} name={students?.find((row) => row.recordId === details)?.fullName ?? ""} onClose={() => setDetails(null)} />
    </>
  );
}
