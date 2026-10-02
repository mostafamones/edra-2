"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { z } from "zod";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AcademyGate } from "@/modules/auth";
import type { AcademyEntry } from "@/modules/academies";
import { canEditSchedule } from "../permissions";
import { loadSchedule, scheduleQueryKey } from "../queries";
import { ScheduleFormPage } from "./form-page";

export function EditSchedulePage({ id }: { id: string }) {
  return <AcademyGate>{(academy) => <EditScheduleContent academy={academy} id={id} />}</AcademyGate>;
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <Alert>
        <AlertCircle />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-3">{children}</AlertDescription>
      </Alert>
    </main>
  );
}

const backLink = <Button variant="outline" size="sm" asChild><Link href="/app/schedules">Back to schedules</Link></Button>;

function EditScheduleContent({ academy, id }: { academy: AcademyEntry; id: string }) {
  const validId = z.uuid().safeParse(id).success;
  // Fetched directly by academy and id, so the link works however many schedules exist.
  const query = useQuery({ queryKey: scheduleQueryKey(academy.id, id), queryFn: () => loadSchedule(academy.id, id), enabled: validId });

  if (validId && query.isPending) {
    return (
      <main role="status" aria-label="Loading schedule" className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8 sm:px-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </main>
    );
  }
  if (query.isError) {
    return (
      <Notice title="Couldn’t load the schedule">
        <span>Check your connection and try again.</span>
        <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
          {query.isFetching ? "Retrying…" : "Try again"}
        </Button>
      </Notice>
    );
  }
  const found = query.data;
  if (!validId || !found || found.schedule.academy_id !== academy.id)
    return <Notice title="Schedule not found"><span>It may belong to another academy or no longer exist.</span>{backLink}</Notice>;
  if (found.schedule.archived_at)
    return <Notice title="This schedule is archived"><span>Archived schedules can’t be edited.</span>{backLink}</Notice>;
  if (!canEditSchedule(academy.role, found.schedule))
    return <Notice title="You can’t edit this schedule"><span>Only owners and admins can change recurring schedules.</span>{backLink}</Notice>;

  return (
    <ScheduleFormPage
      key={found.schedule.id}
      academy={academy}
      schedule={found.schedule}
      slots={found.slots}
      sessions={found.sessions}
      title="Edit schedule"
      description={found.schedule.title}
    />
  );
}
