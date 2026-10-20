import Link from "next/link";
import { IconArrowLeft, IconChevronLeft, IconChevronRight, IconFileCertificate } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { studentAcademyPath } from "@/lib/routing";

import { listMyExams } from "../data";
import { STUDENT_EXAM_PAGE_SIZE, type StudentExamAcademy, type StudentExamSummary } from "../types";
import { StudentExamNotice } from "./notice";
import { StudentExamStatus } from "./status";
import { StudentExamTime, formatDuration } from "./time";

/** Exams page of one connected academy: discoverable exams with status and timing, paginated. */
export async function StudentExamList({ academy, page }: { academy: StudentExamAcademy; page: number }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col items-start gap-2">
        <Button variant="ghost" size="sm" className="-ml-2" asChild>
          <Link href={studentAcademyPath(academy.slug)}><IconArrowLeft aria-hidden="true" />{academy.name}</Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Exams</h1>
      </div>
      <Content academy={academy} page={page} />
    </main>
  );
}

async function Content({ academy, page }: { academy: StudentExamAcademy; page: number }) {
  if (academy.access !== "active") return <StudentExamNotice access={academy.access} />;
  const result = await listMyExams({ academyId: academy.id, page });
  if (!result.ok) {
    // Transient failures reach the route's error boundary, which offers a retry.
    if (result.code === "unavailable") throw new Error(result.message);
    return <StudentExamNotice message={result.message} />;
  }
  const { items, total } = result.data;
  const pages = Math.max(1, Math.ceil(total / STUDENT_EXAM_PAGE_SIZE));
  return (
    <>
      {items.length === 0 ? (
        <Empty className="rounded-xl border border-dashed py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon"><IconFileCertificate aria-hidden="true" /></EmptyMedia>
            <EmptyTitle>No exams</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((exam) => <ExamItem key={exam.examId} academySlug={academy.slug} exam={exam} />)}
        </ul>
      )}
      {pages > 1 && (
        <nav aria-label="Exam pages" className="flex items-center justify-between gap-2 text-sm">
          <PageLink academySlug={academy.slug} page={page - 1} disabled={page <= 1}><IconChevronLeft aria-hidden="true" />Previous</PageLink>
          <span className="text-muted-foreground">Page {Math.min(page, pages)} of {pages}</span>
          <PageLink academySlug={academy.slug} page={page + 1} disabled={page >= pages}>Next<IconChevronRight aria-hidden="true" /></PageLink>
        </nav>
      )}
    </>
  );
}

function ExamItem({ academySlug, exam }: { academySlug: string; exam: StudentExamSummary }) {
  return (
    <li>
      <Card className="relative flex-row items-center justify-between gap-4 px-4 py-4 transition-colors hover:bg-muted/40 focus-within:ring-2 focus-within:ring-ring">
        <div className="flex min-w-0 flex-col gap-1">
          <Link href={studentAcademyPath(academySlug, `exams/${exam.examId}`)} className="truncate font-medium outline-none after:absolute after:inset-0">
            {exam.title}
          </Link>
          <Timing exam={exam} />
        </div>
        <StudentExamStatus action={exam.action} />
      </Card>
    </li>
  );
}

/**
 * Upcoming: the opening. Open: the scheduled close (new starts stop). Completion period: the actual
 * close. Closed: when it actually closed.
 */
function moment(exam: StudentExamSummary): [string, string] | null {
  if (exam.action === "not_yet_open" && exam.opensAt) return ["Opens", exam.opensAt];
  if ((exam.phase === "closed" || exam.phase === "archived") && exam.actualClosesAt) return ["Closed", exam.actualClosesAt];
  if (exam.phase === "headroom" && exam.actualClosesAt) return ["Closes", exam.actualClosesAt];
  return exam.closesAt ? ["Closes", exam.closesAt] : null;
}

function Timing({ exam }: { exam: StudentExamSummary }) {
  const at = moment(exam);
  const parts = [
    at && <span key="at">{at[0]} <StudentExamTime value={at[1]} /></span>,
    exam.timeLimitMinutes !== null && <span key="duration">{formatDuration(exam.timeLimitMinutes)}</span>,
  ].filter(Boolean);
  return <p className="flex flex-wrap gap-x-3 text-sm text-muted-foreground">{parts}</p>;
}

function PageLink({ academySlug, page, disabled, children }: { academySlug: string; page: number; disabled: boolean; children: React.ReactNode }) {
  if (disabled) return <Button variant="outline" size="sm" disabled>{children}</Button>;
  return (
    <Button variant="outline" size="sm" asChild>
      <Link href={`${studentAcademyPath(academySlug, "exams")}${page > 1 ? `?page=${page}` : ""}`}>{children}</Link>
    </Button>
  );
}
