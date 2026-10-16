"use client";

import { IconInfoCircle } from "@tabler/icons-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { formatScore } from "@/lib/score";
import { studentStatus } from "../../status";
import type { Exam, ExamStudent } from "../../types";
import { REASON_LABELS, RESULT_LABELS, STATUS_BADGE, STATUS_LABELS } from "../shared/labels";
import { ExamTime } from "../shared/time";

/** Attempt, acceptance and result facts. A finalization reason never implies a score. */
export function WorkTimeline({ exam, student }: { exam: Exam; student: ExamStudent }) {
  const status = studentStatus(student);
  const { attempt, submission, result, publication } = student;
  const facts: { label: string; value: React.ReactNode }[] = [];
  if (attempt) {
    facts.push({ label: "Online attempt started", value: <ExamTime value={attempt.startedAt} /> });
    facts.push({ label: "Original deadline", value: <ExamTime value={attempt.deadlineAt} /> });
    facts.push({ label: "Departures", value: `${attempt.departureCount} of 3${attempt.departureCount >= 3 ? " (kicked)" : ""}` });
    if (attempt.lastSavedAt) facts.push({ label: "Last answer saved", value: <ExamTime value={attempt.lastSavedAt} /> });
  }
  if (submission) {
    facts.push({ label: "Accepted work", value: submission.source === "online" ? "Online submission" : "Physical work" });
    facts.push({ label: "Reason", value: REASON_LABELS[submission.reason] });
    facts.push({ label: submission.source === "online" ? "Submitted" : "Confirmed", value: <ExamTime value={submission.submittedAt} /> });
    if (submission.processedAt !== submission.submittedAt) facts.push({ label: "Processed", value: <ExamTime value={submission.processedAt} /> });
    if (exam.actualClosesAt) facts.push({ label: "Actual closure", value: <ExamTime value={exam.actualClosesAt} /> });
  }
  return (
    <section aria-label="Work summary" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={STATUS_BADGE[status]}>{STATUS_LABELS[status]}</Badge>
        {!student.eligible && <Badge variant="outline">Not in the audience now</Badge>}
        {student.solutionsQualified && <Badge variant="secondary">Solutions released</Badge>}
      </div>
      {facts.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {facts.map((fact) => (<div key={fact.label} className="contents"><dt className="text-muted-foreground">{fact.label}</dt><dd>{fact.value}</dd></div>))}
        </dl>
      )}
      {submission && (
        <div className="grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-2">
          <div>
            <span className="block text-xs text-muted-foreground">Current result (private)</span>
            {result?.complete ? <span className="font-medium tabular-nums">{formatScore(result.total)} / {formatScore(result.maxScore)}</span>
              : <span>Incomplete{result && result.required > 0 ? ` · ${result.marked} of ${result.required} written questions marked` : ""}</span>}
          </div>
          <div>
            <span className="block text-xs text-muted-foreground">Official result · {RESULT_LABELS[student.publicationState]}</span>
            {publication ? <span className="font-medium tabular-nums">{formatScore(publication.total)} / {formatScore(publication.maxScore)} <span className="font-normal text-muted-foreground">(revision {publication.revision}{publication.automatic ? ", automatic" : ""})</span></span>
              : <span className="text-muted-foreground">Not announced</span>}
          </div>
        </div>
      )}
      {attempt?.superseded && (
        <Alert>
          <IconInfoCircle />
          <AlertTitle>Online draft kept as history</AlertTitle>
          <AlertDescription>Physical work was confirmed first, so this student’s saved online answers were not used and can no longer be submitted.</AlertDescription>
        </Alert>
      )}
      {submission?.source === "online" && student.physicalDraft && (
        <Alert>
          <IconInfoCircle />
          <AlertTitle>Physical draft kept as history</AlertTitle>
          <AlertDescription>The online submission was accepted first, so the physical entry was not used.</AlertDescription>
        </Alert>
      )}
    </section>
  );
}
