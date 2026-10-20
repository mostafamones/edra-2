import Link from "next/link";
import { notFound } from "next/navigation";
import { IconArrowLeft } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { studentAcademyPath } from "@/lib/routing";

import type { FinalizationReason } from "../../types";
import { getMyExamOverview } from "../data";
import type { StudentExamAcademy, StudentExamOverview } from "../types";
import { StudentExamEntry } from "./entry";
import { StudentExamNotice } from "./notice";
import { StudentExamStatus } from "./status";
import { StudentExamTime, formatDuration } from "./time";

const REASONS: Record<FinalizationReason, string> = {
  submitted: "Submitted by you",
  timer: "Time ran out",
  kicked: "Ended after leaving the exam",
  window_closed: "Exam window closed",
  physical: "Paper submission",
};

/**
 * One exam's overview: instructions, duration, availability and the student's own attempt,
 * submission and official total. Opening it never starts the timer.
 */
export async function StudentExamOverviewPage({ academy, examId }: { academy: StudentExamAcademy; examId: string }) {
  if (academy.access !== "active") {
    return <Shell academy={academy}><StudentExamNotice access={academy.access} /></Shell>;
  }
  const result = await getMyExamOverview({ academyId: academy.id, examId });
  if (!result.ok) {
    if (result.code === "not_found" || result.code === "validation") notFound();
    // Transient failures reach the route's error boundary, which offers a retry.
    if (result.code === "unavailable") throw new Error(result.message);
    return <Shell academy={academy}><StudentExamNotice message={result.message} /></Shell>;
  }
  const exam = result.data;
  return (
    <Shell academy={academy}>
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{exam.title}</h1>
        <StudentExamStatus action={exam.action} />
      </div>
      {exam.instructions && <p className="whitespace-pre-wrap text-sm leading-6">{exam.instructions}</p>}
      <Card>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            {exam.timeLimitMinutes !== null && <Detail label="Duration">{formatDuration(exam.timeLimitMinutes)}</Detail>}
            <Availability exam={exam} />
            {exam.attempt && <Detail label="Started"><StudentExamTime value={exam.attempt.startedAt} /></Detail>}
            {exam.attempt && exam.action === "resume" && <Detail label="Your deadline"><StudentExamTime value={exam.attempt.cutoffAt} /></Detail>}
          </dl>
        </CardContent>
      </Card>
      {exam.submission && (
        <Card>
          <CardHeader><CardTitle>Submission</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <Detail label="Received"><StudentExamTime value={exam.submission.submittedAt} /></Detail>
              <Detail label="Ended by">{REASONS[exam.submission.reason]}</Detail>
            </dl>
          </CardContent>
        </Card>
      )}
      {exam.result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Result
              {exam.result.corrected && <Badge variant="secondary">Corrected</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <Detail label="Score"><span className="text-lg font-semibold tabular-nums">{exam.result.total} / {exam.result.maxScore}</span></Detail>
              {exam.result.corrected && exam.result.correctedAt
                ? <Detail label="Corrected"><StudentExamTime value={exam.result.correctedAt} /></Detail>
                : <Detail label="Published"><StudentExamTime value={exam.result.publishedAt} /></Detail>}
            </dl>
          </CardContent>
        </Card>
      )}
      {(exam.action === "start" || exam.action === "resume") && (
        <StudentExamEntry academyId={academy.id} examId={exam.examId} resume={exam.action === "resume"} />
      )}
    </Shell>
  );
}

/** Opening and closing times; the scheduled close stops new starts, the actual close ends the completion period. */
function Availability({ exam }: { exam: StudentExamOverview }) {
  if (!exam.opensAt || !exam.closesAt || !exam.actualClosesAt) return null;
  const closed = exam.phase === "closed" || exam.phase === "archived";
  return (
    <>
      <Detail label="Opens"><StudentExamTime value={exam.opensAt} /></Detail>
      {closed
        ? <Detail label="Closed"><StudentExamTime value={exam.actualClosesAt} /></Detail>
        : <Detail label={exam.phase === "headroom" ? "Closed to new starts" : "Closes"}><StudentExamTime value={exam.closesAt} /></Detail>}
    </>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium">{children}</dd>
    </div>
  );
}

function Shell({ academy, children }: { academy: StudentExamAcademy; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Button variant="ghost" size="sm" className="-ml-2 self-start" asChild>
        <Link href={studentAcademyPath(academy.slug, "exams")}><IconArrowLeft aria-hidden="true" />Exams</Link>
      </Button>
      {children}
    </main>
  );
}
