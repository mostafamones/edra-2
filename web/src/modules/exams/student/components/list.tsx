import Link from "next/link";
import { IconArrowRight, IconCalendarEvent, IconChevronLeft, IconChevronRight, IconFileCertificate } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { studentAcademyPath } from "@/lib/routing";

import { listMyExams } from "../data";
import { STUDENT_EXAM_PAGE_SIZE, type StudentExamAcademy, type StudentExamSummary } from "../types";
import { StudentExamNotice } from "./notice";
import { StudentExamStatus } from "./status";
import { StudentExamTime } from "./time";

/** Exams page of one connected academy: discoverable exams with status and timing, paginated. */
export async function StudentExamList({ academy, page }: { academy: StudentExamAcademy; page: number }) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Exams</h1>
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
        SECTIONS.map((section) => {
          const exams = items.filter((exam) => section.actions.includes(exam.action));
          if (exams.length === 0) return null;
          return (
            <section key={section.title} aria-labelledby={`exams-${section.id}`} className="flex flex-col gap-3">
              <h2 id={`exams-${section.id}`} className="text-sm font-medium text-muted-foreground">
                {section.title} <span className="tabular-nums">{exams.length}</span>
              </h2>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {exams.map((exam) => <ExamItem key={exam.examId} academySlug={academy.slug} exam={exam} />)}
              </ul>
            </section>
          );
        })
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

type Action = StudentExamSummary["action"];
// Every action belongs to exactly one section; the server's order is kept inside each.
const SECTIONS: { id: string; title: string; actions: Action[] }[] = [
  { id: "now", title: "Available now", actions: ["start", "resume"] },
  { id: "upcoming", title: "Upcoming", actions: ["not_yet_open"] },
  { id: "past", title: "Past", actions: ["submitted", "no_new_starts", "ineligible", "unavailable"] },
];

const CALLS: Partial<Record<StudentExamSummary["action"], string>> = { start: "Start exam", resume: "Resume exam" };

function ExamItem({ academySlug, exam }: { academySlug: string; exam: StudentExamSummary }) {
  const call = CALLS[exam.action];
  return (
    <li className="min-w-0">
      <Card className={cn(
        "group relative h-full gap-0 py-0 transition-colors hover:bg-muted/40 focus-within:ring-2 focus-within:ring-ring",
        call && "ring-1 ring-primary/40",
      )}>
        <div className="flex flex-1 flex-col gap-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className={cn("flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground", call && "bg-primary/15 text-primary")}>
              <IconFileCertificate className="size-5" aria-hidden="true" />
            </div>
            <StudentExamStatus action={exam.action} />
          </div>
          <Link href={studentAcademyPath(academySlug, `exams/${exam.examId}`)}
            className="line-clamp-2 font-heading text-base font-semibold leading-snug outline-none after:absolute after:inset-0">
            {exam.title}
          </Link>
          <div className="mt-auto flex flex-col gap-1.5 text-sm text-muted-foreground"><Timing exam={exam} /></div>
        </div>
        {call && (
          <div className="flex items-center justify-between border-t px-5 py-3 text-sm font-medium text-primary">
            {call}<IconArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </div>
        )}
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
  return (
    <>
      {at && <span className="flex items-center gap-1.5"><IconCalendarEvent className="size-4" aria-hidden="true" />{at[0]} <StudentExamTime value={at[1]} /></span>}
    </>
  );
}

function PageLink({ academySlug, page, disabled, children }: { academySlug: string; page: number; disabled: boolean; children: React.ReactNode }) {
  if (disabled) return <Button variant="outline" size="sm" disabled>{children}</Button>;
  return (
    <Button variant="outline" size="sm" asChild>
      <Link href={`${studentAcademyPath(academySlug, "exams")}${page > 1 ? `?page=${page}` : ""}`}>{children}</Link>
    </Button>
  );
}
