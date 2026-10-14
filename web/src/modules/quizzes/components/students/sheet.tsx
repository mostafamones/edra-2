"use client";

import { useQuery } from "@tanstack/react-query";
import { IconAlertCircle } from "@tabler/icons-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import type { AcademyEntry } from "@/modules/academies";
import type { QuizPermissions } from "../../permissions";
import { loadQuizStudent, quizStudentQueryKey } from "../../queries";
import type { Quiz } from "../../types";
import { WorkHistory } from "./history";
import { PhysicalEntry } from "./physical";
import { WorkReview } from "./review";
import { WorkTimeline } from "./timeline";

type Props = {
  academy: AcademyEntry;
  quiz: Quiz;
  permissions: QuizPermissions;
  recordId: string | null;
  name: string;
  onClose: () => void;
};

/**
 * One student's quiz work. Before a source is accepted: physical entry and confirmation. Afterwards:
 * the accepted answers, private marks, announcement and official history. Sections re-mount on every
 * new version so they always start from saved values.
 */
export function StudentSheet({ academy, quiz, permissions, recordId, name, onClose }: Props) {
  const query = useQuery({
    queryKey: quizStudentQueryKey(academy.id, quiz.id, recordId ?? ""),
    queryFn: () => loadQuizStudent(academy.id, quiz.id, recordId as string),
    enabled: recordId !== null,
  });
  const data = query.data;
  return (
    <Sheet open={recordId !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="text-lg font-semibold" style={{ fontFamily: "inherit" }}>{data?.student.fullName ?? name}</SheetTitle>
          <SheetDescription>{data ? [data.student.studentCode, data.student.groupName].filter(Boolean).join(" · ") || "No code or group" : "Loading…"}</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pb-6">
          {query.isPending && recordId && <div role="status" aria-label="Loading student work" className="flex flex-col gap-3"><Skeleton className="h-20" /><Skeleton className="h-64" /></div>}
          {query.isError && (
            <Alert variant="destructive">
              <IconAlertCircle />
              <AlertTitle>Couldn’t load this student’s work</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center gap-3">
                Check your connection and try again.<Button size="sm" variant="outline" onClick={() => void query.refetch()}>Retry</Button>
              </AlertDescription>
            </Alert>
          )}
          {data === null && <p className="text-sm text-muted-foreground">This student isn’t part of this quiz.</p>}
          {data && (
            <>
              <WorkTimeline quiz={quiz} student={data.student} />
              {data.student.submission ? (
                <WorkReview key={`${data.student.version}-${quiz.scoringRevision}`} quiz={quiz} student={data.student} detail={data.detail} permissions={permissions} />
              ) : (
                <PhysicalEntry key={data.student.physicalDraft?.version ?? 0} quiz={quiz} student={data.student} detail={data.detail} permissions={permissions} />
              )}
              <WorkHistory quiz={quiz} detail={data.detail} />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
