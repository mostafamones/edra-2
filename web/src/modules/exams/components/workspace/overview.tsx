"use client";

import { useQuery } from "@tanstack/react-query";

import { SHEET_KIND_ICONS } from "@/components/shared/assessment/sheet/types";
import { ScoreDistribution } from "@/components/shared/assessment/workspace/distribution";
import { PartsCard, type PartRow } from "@/components/shared/assessment/workspace/parts";
import { StatStrip } from "@/components/shared/assessment/workspace/stats";
import { TopStudents } from "@/components/shared/assessment/workspace/top";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatScore, sumScores } from "@/lib/score";
import type { AcademyEntry } from "@/modules/academies";
import { loadExamStudents, examStudentsQueryKey } from "../../queries";
import type { Exam } from "../../types";
import { ExamScoring } from "./scoring";
import { ISSUE_LABELS, KIND_LABELS } from "../shared/labels";

const number = new Intl.NumberFormat("en");
const percent = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });

function partRows(exam: Exam): PartRow[] {
  return exam.parts.map((part) => {
    const issues = new Set(exam.issues.filter((issue) => issue.id === part.id || part.questions.some((question) => question.id === issue.id)).map((issue) => ISSUE_LABELS[issue.issue]));
    return {
      id: part.id, position: part.position, title: part.title, Icon: SHEET_KIND_ICONS[part.kind],
      maxScore: sumScores(part.questions.filter((question) => !question.excluded).map((question) => question.maxScore)) ?? "0",
      detail: `${KIND_LABELS[part.kind]} · ${part.questions.length} question${part.questions.length === 1 ? "" : "s"}`,
      issues: [...issues],
    };
  });
}

/** Stats, the spread of scores, then the parts beside the top students: the same page as an assignment. */
export function ExamOverview({ academy, exam, onViewStudents }: { academy: AcademyEntry; exam: Exam; onViewStudents: () => void }) {
  const query = useQuery({ queryKey: examStudentsQueryKey(academy.id, exam.id), queryFn: () => loadExamStudents(academy.id, exam.id), refetchInterval: 30_000 });
  const loading = query.isPending;
  const results = (query.data ?? []).filter((row) => row.result !== null);
  const complete = results.filter((row) => row.result!.complete);
  const max = Number(exam.effectiveMaxScore);
  const shares = max > 0 ? complete.map((row) => (Number(row.result!.total) / max) * 100) : [];
  const average = shares.length > 0 ? shares.reduce((sum, share) => sum + share, 0) / shares.length : null;
  const scored = loading ? undefined : results.map((row) => ({ id: row.recordId, name: row.fullName, code: row.studentCode, total: row.result!.total, complete: row.result!.complete }));
  const { counts } = exam;

  return (
    <div className="flex flex-col gap-4">
      <StatStrip stats={[
        { label: "Total marks", value: formatScore(exam.effectiveMaxScore) },
        { label: "Students", value: number.format(counts.eligible) },
        { label: "Submitted", value: <>{number.format(counts.submitted)}<span className="text-base font-medium text-muted-foreground"> / {number.format(counts.eligible)}</span></> },
        { label: "Average", loading, value: average === null ? "—" : `${percent.format(average)}%` },
      ]} />

      {exam.instructions && (
        <Card>
          <CardHeader><CardTitle>Instructions</CardTitle></CardHeader>
          <CardContent><p className="text-sm whitespace-pre-wrap text-muted-foreground">{exam.instructions}</p></CardContent>
        </Card>
      )}

      {exam.ready && <ScoreDistribution scores={loading ? undefined : shares} />}

      {!exam.ready ? <PartsCard parts={partRows(exam)} /> : (
        <div className="grid items-stretch gap-4 lg:grid-cols-2">
          <PartsCard parts={partRows(exam)} />
          <TopStudents students={scored} maxScore={exam.effectiveMaxScore} onViewAll={onViewStudents} />
        </div>
      )}
      <ExamScoring exam={exam} role={academy.role} />
    </div>
  );
}
