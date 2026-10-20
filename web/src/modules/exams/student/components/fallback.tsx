"use client";

import { IconAlertCircle, IconRefresh } from "@tabler/icons-react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/** Route loading state for the student exam pages. */
export function StudentExamsLoading() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6" aria-busy="true">
      <Skeleton className="h-8 w-40" />
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((key) => <Skeleton key={key} className="h-20 w-full rounded-xl" />)}
      </div>
    </main>
  );
}

/** Route error state: the read could not complete. Retry re-fetches the segment. */
export function StudentExamsError({ retry }: { retry: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8 sm:px-6">
      <Alert variant="destructive">
        <IconAlertCircle aria-hidden="true" />
        <AlertTitle>Could not load exams. Check your connection and try again.</AlertTitle>
      </Alert>
      <Button variant="outline" className="self-start" onClick={() => retry()}>
        <IconRefresh aria-hidden="true" />Try again
      </Button>
    </main>
  );
}
