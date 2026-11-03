import Link from "@/components/shared/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { formatAcademyDateTime } from "@/lib/academy-time";
import { studentAcademyPath, studentListPath } from "@/lib/routing";
import { Badge } from "@/components/ui/badge";
import { StudentExamStatus } from "@/modules/exams/student/components/status";

import type { LearningHomeData } from "../server";
import { ItemRow } from "./section";

/** Home across all academies: courses to continue, work to do and exams open or coming up. */
export function LearningHome({ data: { resume, due, upcoming } }: { data: LearningHomeData }) {
  const more = (section: string) => studentListPath(section);
  const empty = !resume.length && !due.length && !upcoming.length;

  return (
    <main className="page-shell">
      <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
      {empty ? (
        <Empty className="rounded-xl border border-dashed py-16"><EmptyHeader><EmptyTitle>Nothing to do right now</EmptyTitle></EmptyHeader></Empty>
      ) : (
        <>
          <Block title="Continue learning" href={more("courses")} show={resume.length > 0}>
            {resume.map((item) => (
              <ItemRow key={item.id} href={studentAcademyPath(item.academy.slug, `units/${item.id}`)} title={item.title}
                meta={<><span>{item.academy.name}</span><span className="tabular-nums">{item.completed} of {item.total} completed</span></>} />
            ))}
          </Block>
          <Block title="To do" href={more("assignments")} show={due.length > 0}>
            {due.map((item) => (
              <ItemRow key={item.id} href={studentAcademyPath(item.academy.slug, `assignments/${item.id}`)} title={item.title} badge={<Badge variant={item.status.tone}>{item.status.label}</Badge>}
                meta={<><span>{item.academy.name}</span>{item.dueAt && <span>Due <time dateTime={item.dueAt}>{formatAcademyDateTime(item.dueAt)}</time></span>}</>} />
            ))}
          </Block>
          <Block title="Exams" href={more("exams")} show={upcoming.length > 0}>
            {upcoming.map((item) => (
              <ItemRow key={item.examId} href={studentAcademyPath(item.academy.slug, `exams/${item.examId}`)} title={item.title} badge={<StudentExamStatus action={item.action} />}
                meta={<><span>{item.academy.name}</span>{item.opensAt && <span>Opens <time dateTime={item.opensAt}>{formatAcademyDateTime(item.opensAt)}</time></span>}</>} />
            ))}
          </Block>
        </>
      )}
    </main>
  );
}

function Block({ title, href, show, children }: { title: string; href: string; show: boolean; children: ReactNode }) {
  if (!show) return null;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-medium">{title}</h2>
        <Button variant="ghost" size="sm" asChild><Link href={href}>View all</Link></Button>
      </div>
      <ul className="flex flex-col gap-2">{children}</ul>
    </section>
  );
}
