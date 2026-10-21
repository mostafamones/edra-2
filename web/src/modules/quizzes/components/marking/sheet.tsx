"use client";

import { useQuery } from "@tanstack/react-query";

import { MarkingSheet } from "@/components/shared/assessment/marking/sheet";
import { formatScore } from "@/lib/score";
import type { AcademyEntry } from "@/modules/academies";
import { quizPermissions } from "../../permissions";
import { loadQuizStudents, quizStudentsQueryKey } from "../../queries";
import { studentStatus } from "../../status";
import type { Quiz } from "../../types";
import { STATUS_LABELS } from "../shared/labels";
import { QuizMarks } from "./form";

/** The marking flow of the quiz, on the shared sheet. */
export function QuizMarking({ academy, quiz }: { academy: AcademyEntry; quiz: Quiz }) {
  const query = useQuery({ queryKey: quizStudentsQueryKey(academy.id, quiz.id), queryFn: () => loadQuizStudents(academy.id, quiz.id), refetchInterval: 30_000 });
  const enterWork = quizPermissions(academy.role, quiz).enterWork;
  const rows = (query.data ?? []).filter((row) => row.submission !== null || (enterWork && row.eligible));
  return (
    <MarkingSheet
      unavailable={query.isPending || (query.isSuccess && rows.length === 0)}
      roster={{ isPending: query.isPending, isError: query.isError, rows }}
      summary={(row) => (row.result?.complete ? `${formatScore(row.result.total)} / ${formatScore(row.result.maxScore)}` : STATUS_LABELS[studentStatus(row)])}
      form={(student, { onSaved }) => <QuizMarks key={student.recordId} academy={academy} quiz={quiz} student={student} onSaved={onSaved} />}
    />
  );
}
