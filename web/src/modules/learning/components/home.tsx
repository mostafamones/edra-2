import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { formatAcademyDateTime } from "@/lib/academy-time";
import { studentAcademyPath, studentListPath } from "@/lib/routing";
import { StudentAssignmentStatus } from "@/modules/assignments/server";
import { StudentExamStatus } from "@/modules/exams/server";

import { readMyAssignments, readMyExams, readMyUnits, type AcademyItems } from "../data";
import { unitStarted } from "../started";
import { ItemRow } from "./section";

const LIMIT = 5;

function flatten<T>(groups: AcademyItems<T>[]) {
  return groups.flatMap(({ academy, items }) => (items ?? []).map((item) => ({ item, academy })));
}

/** Home across all academies: courses to continue, work to do and exams open or coming up. */
export async function LearningHome() {
  const [units, assignments, exams] = await Promise.all([readMyUnits(undefined), readMyAssignments(undefined), readMyExams(undefined)]);
  const more = (section: string) => studentListPath(section);
  const resume = flatten(units).filter(({ item }) => unitStarted(item) && item.progress!.completed < item.progress!.total).slice(0, LIMIT);
  const due = flatten(assignments).filter(({ item }) => !item.receipt && !item.result && !item.blockedReason)
    // Dated work first, soonest due on top.
    .sort((a, b) => (a.item.dueAt ?? "~").localeCompare(b.item.dueAt ?? "~")).slice(0, LIMIT);
  const upcoming = flatten(exams).filter(({ item }) => ["start", "resume", "not_yet_open"].includes(item.action)).slice(0, LIMIT);
  const empty = !resume.length && !due.length && !upcoming.length;

  return (
    <main className="page-shell">
      <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
      {empty ? (
        <Empty className="rounded-xl border border-dashed py-16"><EmptyHeader><EmptyTitle>Nothing to do right now</EmptyTitle></EmptyHeader></Empty>
      ) : (
        <>
          <Block title="Continue learning" href={more("courses")} show={resume.length > 0}>
            {resume.map(({ item, academy }) => (
              <ItemRow key={item.id} href={studentAcademyPath(academy.slug, `units/${item.id}`)} title={item.title}
                meta={<><span>{academy.name}</span><span className="tabular-nums">{item.progress!.completed} of {item.progress!.total} completed</span></>} />
            ))}
          </Block>
          <Block title="To do" href={more("assignments")} show={due.length > 0}>
            {due.map(({ item, academy }) => (
              <ItemRow key={item.id} href={studentAcademyPath(academy.slug, `assignments/${item.id}`)} title={item.title} badge={<StudentAssignmentStatus item={item} />}
                meta={<><span>{academy.name}</span>{item.dueAt && <span>Due <time dateTime={item.dueAt}>{formatAcademyDateTime(item.dueAt)}</time></span>}</>} />
            ))}
          </Block>
          <Block title="Exams" href={more("exams")} show={upcoming.length > 0}>
            {upcoming.map(({ item, academy }) => (
              <ItemRow key={item.examId} href={studentAcademyPath(academy.slug, `exams/${item.examId}`)} title={item.title} badge={<StudentExamStatus action={item.action} />}
                meta={<><span>{academy.name}</span>{item.opensAt && item.action === "not_yet_open" && <span>Opens <time dateTime={item.opensAt}>{formatAcademyDateTime(item.opensAt)}</time></span>}</>} />
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
