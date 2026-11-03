import Link from "@/components/shared/link";
import { IconAlertCircle, IconArrowLeft } from "@/components/shared/icons";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAcademyDateTime } from "@/lib/academy-time";
import { studentAcademyPath, studentListPath } from "@/lib/routing";
import { StudentMaterial } from "@/modules/content";
import { BreadcrumbTitle } from "@/components/shared/breadcrumb-title";

import type { StudentAssignmentData } from "../page.server";
import { blockedMessage } from "../errors";
import type { StudentAssignmentAcademy } from "../types";
import { StudentAssignmentEditor } from "./editor";

const time = (value: string) => <time dateTime={value}>{formatAcademyDateTime(value)}</time>;

/**
 * One assignment: instructions, receipt, the official result and earned answer videos, then the
 * editor while online work is allowed. Opening the page never creates a draft or selects a source.
 */
export function StudentAssignmentPage({ academy, data }: { academy: StudentAssignmentAcademy; data: StudentAssignmentData }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Button variant="ghost" size="sm" className="-ml-2 self-start" asChild>
        <Link href={studentListPath("assignments")}><IconArrowLeft aria-hidden="true" />Assignments</Link>
      </Button>
      {data.kind === "notice" ? (
        <Alert><IconAlertCircle aria-hidden="true" /><AlertTitle>{data.message}</AlertTitle></Alert>
      ) : (() => {
        const assignment = data.assignment;
        const unit = assignment.unit;
        return (
          <>
            <BreadcrumbTitle title={assignment.title} />
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{assignment.title}</h1>
              <Badge variant={assignment.status.tone}>{assignment.status.label}</Badge>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {unit && <Link className="underline-offset-4 hover:underline" href={studentAcademyPath(academy.slug, `units/${unit.id}`)}>{unit.title}</Link>}
              {assignment.dueAt && <span>Due {time(assignment.dueAt)}</span>}
              {!assignment.required && <Badge variant="outline">Optional</Badge>}
            </div>
            {assignment.instructions && <p className="whitespace-pre-wrap text-sm leading-6">{assignment.instructions}</p>}
            {assignment.receipt && (
              <Card>
                <CardHeader><CardTitle>Submission</CardTitle></CardHeader>
                <CardContent className="flex flex-wrap items-center gap-3 text-sm">
                  <span>Submitted {time(assignment.receipt.submittedAt)}</span>
                  {assignment.receipt.late && <Badge variant="outline">Late</Badge>}
                </CardContent>
              </Card>
            )}
            {assignment.result && (
              <Card>
                <CardHeader><CardTitle>Result</CardTitle></CardHeader>
                <CardContent className="flex flex-col gap-2 text-sm">
                  <p className="text-2xl font-semibold tabular-nums">{assignment.result.total} / {assignment.result.maxScore}</p>
                  {assignment.result.feedback && <p className="whitespace-pre-wrap">{assignment.result.feedback}</p>}
                </CardContent>
              </Card>
            )}
            {unit && assignment.answerVideos.length > 0 && (
              <Card>
                <CardHeader><CardTitle>Answer videos</CardTitle></CardHeader>
                <CardContent>
                  <ul className="flex flex-col gap-2">
                    {assignment.answerVideos.map((video) => (
                      <li key={video.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                        <span className="font-medium">{video.title}</span>
                        <StudentMaterial academyId={academy.id} unitId={unit.id} itemId={video.id} title={video.title} expiresAt={null} />
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
            {data.userId ? (
              <StudentAssignmentEditor key={JSON.stringify([academy.id, assignment.id, data.userId])} academyId={academy.id} assignmentId={assignment.id} userId={data.userId} dueAt={assignment.dueAt} />
            ) : assignment.blockedReason ? (
              <Alert><IconAlertCircle aria-hidden="true" /><AlertTitle>{blockedMessage(assignment.blockedReason)}</AlertTitle></Alert>
            ) : null}
          </>
        );
      })()}
    </main>
  );
}
