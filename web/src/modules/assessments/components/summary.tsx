"use client";

import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "cn";

import { ScoreDistribution } from "@/components/shared/assessment/workspace/distribution";
import type { TopStudent } from "@/components/shared/assessment/workspace/top";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatScore, sumScores } from "@/lib/score";
import { loadMarks } from "@/modules/assignments";
import { loadExamStudents } from "@/modules/exams";
import { loadQuizStudents } from "@/modules/quizzes";
import type { AssessmentDetails } from "../details";
import { assessmentsRootKey } from "../queries";
import type { AssessmentRow } from "../types";
import { PART_ICONS, partKindLabel } from "./facts";

const number = new Intl.NumberFormat("en");
const percent = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const SHOWN = 5;

/** Every type's students with a total so far, in one shape. */
async function loadScored(academyId: string, details: AssessmentDetails): Promise<TopStudent[]> {
  if (details.type === "assignment") {
    const { students } = await loadMarks(academyId, details.value.id);
    return students.filter((row) => row.total !== null)
      .map((row) => ({ id: row.recordId, name: row.fullName, code: row.studentCode, total: row.total!, complete: row.marking === "complete" }));
  }
  const rows = details.type === "quiz" ? await loadQuizStudents(academyId, details.value.id) : await loadExamStudents(academyId, details.value.id);
  return rows.filter((row) => row.result !== null)
    .map((row) => ({ id: row.recordId, name: row.fullName, code: row.studentCode, total: row.result!.total, complete: row.result!.complete }));
}

/** Each part's kind, questions and marks, in one shape across types. */
function partRows({ type, value }: AssessmentDetails) {
  return value.parts.map((part) => ({
    id: part.id, title: part.title, kind: part.kind,
    questions: type === "assignment" && part.kind === null ? null : part.questions.length,
    marks: "maxScore" in part ? part.maxScore
      : sumScores(part.questions.filter((question) => !("excluded" in question && question.excluded)).map((question) => question.maxScore)) ?? "0",
  }));
}

type Props = { academyId: string; row: AssessmentRow; details: AssessmentDetails; onViewStudents: () => void };

/** One layout for every type: the score spread, the parts as cards, then the top students. */
export function AssessmentSummary({ academyId, row: { item }, details, onViewStudents }: Props) {
  // Mounted hidden behind Edit, so students load in the background and the tab opens ready.
  const query = useQuery({ queryKey: [...assessmentsRootKey(academyId), "summary", item.type, item.id], queryFn: () => loadScored(academyId, details) });
  if (query.isError) return (
    <div role="alert" className="space-y-3 px-6 py-4">
      <p>Couldn’t load assessment scores.</p>
      <Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}>Retry scores</Button>
    </div>
  );
  const loading = query.isPending;
  const max = Number(item.maxScore);
  const shares = loading || max <= 0 ? undefined : query.data!.filter((row) => row.complete).map((row) => (Number(row.total) / max) * 100);

  const parts = partRows(details);
  const scrolls = parts.length >= 3;
  const ranked = [...(query.data ?? [])].sort((a, b) => Number(b.total) - Number(a.total) || a.name.localeCompare(b.name)).slice(0, SHOWN);

  return (
    <div className="flex flex-col gap-4 px-6 py-4">
      <ScoreDistribution scores={loading ? undefined : shares ?? []} className="bg-muted/50 shadow-none ring-0" />
      {parts.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Parts</h3>
          {/* Three or more scroll sideways across the sheet, the next card peeking in; focusable for keyboard scrolling. */}
          <ul aria-label="Parts" tabIndex={scrolls ? 0 : undefined}
            className={scrolls ? "no-scrollbar -mx-6 flex gap-3 overflow-x-auto px-6 outline-none focus-visible:ring-3 focus-visible:ring-ring/50" : cn("grid gap-3", parts.length > 1 && "sm:grid-cols-2")}>
            {parts.map((part, index) => (
              <li key={part.id} className={scrolls ? "w-2/5 shrink-0" : undefined}>
                <Card size="sm" className="h-full gap-1 bg-muted/50 px-4 py-3 shadow-none ring-0">
                  <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
                    <span className="text-muted-foreground tabular-nums">{index + 1}.</span><span className="truncate">{part.title}</span>
                  </p>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <HugeiconsIcon icon={PART_ICONS[part.kind ?? "legacy"]} strokeWidth={1.5} className="size-3.5 shrink-0" aria-hidden="true" />
                    {partKindLabel(item.type, part.kind)}
                  </p>
                  <p className="mt-1 flex gap-4 text-xs text-muted-foreground tabular-nums">
                    {part.questions !== null && <span>{number.format(part.questions)} question{part.questions === 1 ? "" : "s"}</span>}
                    <span>{formatScore(part.marks)} marks</span>
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Top students</h3>
          <Button variant="ghost" size="sm" onClick={onViewStudents}>View all</Button>
        </div>
        {loading ? <Skeleton className="h-24" /> : ranked.length === 0 ? (
          <Empty className="border py-6"><EmptyHeader><EmptyTitle className="text-sm">No scores yet</EmptyTitle></EmptyHeader></Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Student</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead className="text-right">%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ranked.map((student, index) => (
                <TableRow key={student.id}>
                  <TableCell className="text-muted-foreground tabular-nums">{index + 1}</TableCell>
                  <TableCell className="max-w-56">
                    <span className="block truncate font-medium">{student.name}</span>
                    {student.code && <span className="block text-xs text-muted-foreground">{student.code}</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatScore(student.total)}<span className="text-muted-foreground"> / {formatScore(item.maxScore)}</span>
                    {!student.complete && <span className="block text-xs text-muted-foreground">In progress</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{max > 0 ? `${percent.format((Number(student.total) / max) * 100)}%` : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
