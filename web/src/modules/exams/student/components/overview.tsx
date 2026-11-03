import Link from "@/components/shared/link";
import { IconArrowLeft, IconLoader2 } from "@/components/shared/icons";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { studentListPath } from "@/lib/routing";
import { BreadcrumbTitle } from "@/components/shared/breadcrumb-title";

import type { ExamSource, FinalizationReason } from "../../types";
import type { StudentExamOverviewData } from "../overview.server";
import type { StudentExamAcademy } from "../types";
import { StudentExamEntry } from "./entry";
import { StudentExamNotice } from "./notice";
import { StudentExamRefresh } from "./refresh";
import { StudentExamReviewSection } from "./review";
import { StudentExamStatus } from "./status";
import { StudentExamTime, formatDuration } from "./time";

const REASONS: Record<FinalizationReason, string> = {
  submitted: "Submitted by you",
  timer: "Time ran out",
  kicked: "Ended after leaving the exam",
  window_closed: "Exam window closed",
  physical: "Paper submission",
};

const SOURCES: Record<ExamSource, string> = { online: "Online", physical: "On paper" };

/**
 * One exam's overview: instructions, duration, availability and the student's own attempt,
 * submission and official total, then (EDRA-235) the read-only answers and solutions once the
 * server qualifies them. Opening it never starts the timer.
 */
export function StudentExamOverviewPage({ academy, data }: { academy: StudentExamAcademy; data: StudentExamOverviewData }) {
  if (data.kind === "access") return <Shell><StudentExamNotice access={data.access} /></Shell>;
  if (data.kind === "notice") return <Shell><StudentExamNotice message={data.message} /></Shell>;
  const { exam, review, failure, processing, awaiting, closing } = data;
  return (
    <Shell>
      <BreadcrumbTitle title={exam.title} />
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{exam.title}</h1>
        <StudentExamStatus action={exam.action} />
      </div>
      {exam.instructions && <p className="whitespace-pre-wrap text-sm leading-6">{exam.instructions}</p>}
      <Card>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            {exam.timeLimitMinutes !== null && <Detail label="Duration">{formatDuration(exam.timeLimitMinutes)}</Detail>}
            {exam.availability && <Availability {...exam.availability} />}
            {exam.attempt && <Detail label="Started"><StudentExamTime value={exam.attempt.startedAt} /></Detail>}
            {exam.attempt?.deadline && <Detail label="Your deadline"><StudentExamTime value={exam.attempt.deadline} /></Detail>}
          </dl>
        </CardContent>
      </Card>
      {exam.submission && (
        <Card>
          <CardHeader><CardTitle>Submission</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <Detail label="Submitted"><StudentExamTime value={exam.submission.submittedAt} /></Detail>
              <Detail label="Ended by">{REASONS[exam.submission.reason]}</Detail>
              <Detail label="Source">{SOURCES[exam.submission.source]}</Detail>
            </dl>
          </CardContent>
        </Card>
      )}
      {processing && <Alert role="status"><IconLoader2 className="animate-spin" aria-hidden="true" /><AlertTitle>Processing your submission</AlertTitle></Alert>}
      {exam.submission && !exam.result && (
        <Card>
          <CardHeader><CardTitle>Result</CardTitle></CardHeader>
          <CardContent><p className="text-sm font-medium">Awaiting result</p></CardContent>
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
              <Detail label={exam.result.when.label}><StudentExamTime value={exam.result.when.value} /></Detail>
            </dl>
          </CardContent>
        </Card>
      )}
      {review && <Review academyId={academy.id} examId={exam.examId} review={review} />}
      {(exam.submission || processing) && (
        <StudentExamRefresh poll={awaiting} refreshAt={closing} serverNow={exam.serverNow}
          failure={failure ? "Answers and solutions couldn’t be loaded." : undefined} />
      )}
      {(exam.action === "start" || exam.action === "resume") && (
        <StudentExamEntry academyId={academy.id} examId={exam.examId} resume={exam.action === "resume"} />
      )}
    </Shell>
  );
}

/** Released review, or why it is not available yet. Failures are reported by StudentExamRefresh. */
function Review({ academyId, examId, review }: { academyId: string; examId: string; review: NonNullable<Extract<StudentExamOverviewData, { kind: "exam" }>["review"]> }) {
  if (review.status === "available") return <StudentExamReviewSection academyId={academyId} examId={examId} review={review.data} />;
  return (
    <Card>
      <CardHeader><CardTitle>Answers and solutions</CardTitle></CardHeader>
      <CardContent className="text-sm font-medium">
        {review.reason === "awaiting_closure" && review.closesAt
          ? <p>Available after the exam closes at <StudentExamTime value={review.closesAt} /></p>
          : <p>{review.reason === "awaiting_closure" ? "Available after the exam closes" : "Available after your result is published"}</p>}
      </CardContent>
    </Card>
  );
}

/** Opening and closing times; the scheduled close stops new starts, the actual close ends the completion period. */
function Availability({ opensAt, label, at }: { opensAt: string; label: string; at: string }) {
  return (
    <>
      <Detail label="Opens"><StudentExamTime value={opensAt} /></Detail>
      <Detail label={label}><StudentExamTime value={at} /></Detail>
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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Button variant="ghost" size="sm" className="-ml-2 self-start" asChild>
        <Link href={studentListPath("exams")}><IconArrowLeft aria-hidden="true" />Exams</Link>
      </Button>
      {children}
    </main>
  );
}
