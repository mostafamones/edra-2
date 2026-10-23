import Link from "next/link";
import { IconArrowLeft, IconChevronLeft, IconChevronRight, IconClipboardText } from "@tabler/icons-react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { formatAcademyDateTime } from "@/lib/academy-time";
import { studentAcademyPath } from "@/lib/routing";

import { listMyAssignments } from "../data";
import type { StudentAssignmentAcademy } from "../types";
import { StudentAssignmentStatus } from "./status";

/** Assignments page of one connected academy: standalone and published-unit work, newest first. */
export async function StudentAssignmentList({ academy, page }: { academy: StudentAssignmentAcademy; page: number }) {
  const result = await listMyAssignments({ academyId: academy.id, page, search: "" });
  if (!result.ok && result.code === "unavailable") throw new Error(result.message);
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col items-start gap-2">
        <Button variant="ghost" size="sm" className="-ml-2" asChild>
          <Link href={studentAcademyPath(academy.slug)}><IconArrowLeft aria-hidden="true" />{academy.name}</Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Assignments</h1>
      </div>
      {!result.ok ? (
        <Alert><AlertTitle>{result.message}</AlertTitle></Alert>
      ) : result.data.items.length === 0 ? (
        <Empty className="rounded-xl border border-dashed py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon"><IconClipboardText aria-hidden="true" /></EmptyMedia>
            <EmptyTitle>No assignments</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="flex flex-col gap-3">
          {result.data.items.map((item) => (
            <li key={item.id}>
              <Card className="relative flex-row items-center justify-between gap-4 px-4 py-4 transition-colors hover:bg-muted/40 focus-within:ring-2 focus-within:ring-ring">
                <div className="flex min-w-0 flex-col gap-1">
                  <Link href={studentAcademyPath(academy.slug, `assignments/${item.id}`)} className="truncate font-medium outline-none after:absolute after:inset-0">{item.title}</Link>
                  <p className="flex flex-wrap gap-x-3 text-sm text-muted-foreground">
                    {item.unit && <span>{item.unit.title}</span>}
                    {item.dueAt && <span>Due <time dateTime={item.dueAt}>{formatAcademyDateTime(item.dueAt)}</time></span>}
                    {!item.required && <span>Optional</span>}
                  </p>
                </div>
                <StudentAssignmentStatus item={item} />
              </Card>
            </li>
          ))}
        </ul>
      )}
      {result.ok && (page > 1 || result.data.hasMore) && (
        <nav aria-label="Assignment pages" className="flex items-center justify-between gap-2 text-sm">
          <PageLink academySlug={academy.slug} page={page - 1} disabled={page <= 1}><IconChevronLeft aria-hidden="true" />Previous</PageLink>
          <span className="text-muted-foreground">Page {page}</span>
          <PageLink academySlug={academy.slug} page={page + 1} disabled={!result.data.hasMore}>Next<IconChevronRight aria-hidden="true" /></PageLink>
        </nav>
      )}
    </main>
  );
}

function PageLink({ academySlug, page, disabled, children }: { academySlug: string; page: number; disabled: boolean; children: React.ReactNode }) {
  if (disabled) return <Button variant="outline" size="sm" disabled>{children}</Button>;
  return (
    <Button variant="outline" size="sm" asChild>
      <Link href={`${studentAcademyPath(academySlug, "assignments")}${page > 1 ? `?page=${page}` : ""}`}>{children}</Link>
    </Button>
  );
}
