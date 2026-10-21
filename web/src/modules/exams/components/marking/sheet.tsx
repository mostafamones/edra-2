"use client";

import { useQuery } from "@tanstack/react-query";

import { MarkingSheet } from "@/components/shared/assessment/marking/sheet";
import { formatScore } from "@/lib/score";
import type { AcademyEntry } from "@/modules/academies";
import { examPermissions } from "../../permissions";
import { loadExamStudents, examStudentsQueryKey } from "../../queries";
import { studentStatus } from "../../status";
import type { Exam } from "../../types";
import { STATUS_LABELS } from "../shared/labels";
import { ExamMarks } from "./form";

/** The marking flow of the exam, on the shared sheet. */
export function ExamMarking({ academy, exam }: { academy: AcademyEntry; exam: Exam }) {
  const query = useQuery({ queryKey: examStudentsQueryKey(academy.id, exam.id), queryFn: () => loadExamStudents(academy.id, exam.id), refetchInterval: 30_000 });
  const enterWork = examPermissions(academy.role, exam).enterWork;
  const rows = (query.data ?? []).filter((row) => row.submission !== null || (enterWork && row.eligible));
  return (
    <MarkingSheet
      unavailable={query.isPending || (query.isSuccess && rows.length === 0)}
      roster={{ isPending: query.isPending, isError: query.isError, rows }}
      summary={(row) => (row.result?.complete ? `${formatScore(row.result.total)} / ${formatScore(row.result.maxScore)}` : STATUS_LABELS[studentStatus(row)])}
      form={(student, { onSaved }) => <ExamMarks key={student.recordId} academy={academy} exam={exam} student={student} onSaved={onSaved} />}
    />
  );
}
