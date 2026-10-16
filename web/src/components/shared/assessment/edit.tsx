"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { IconAlertCircle } from "@tabler/icons-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { AcademyEntry } from "@/modules/academies";

type Props<E> = {
  academy: AcademyEntry;
  noun: string;
  queryKey: readonly unknown[];
  load: () => Promise<E | null>;
  notFound: ReactNode;
  /** Returns the read-only explanation when this entity can’t be edited, otherwise null. */
  blocked: (entity: E) => ReactNode | null;
  children: (entity: E) => ReactNode;
};

/**
 * Loads the entity an edit route opens. It never refetches underneath an open form: the expected
 * version is the one the editor started from.
 */
export function AssessmentEditGate<E>({ noun, queryKey, load, notFound, blocked, children }: Props<E>) {
  const query = useQuery({ queryKey: [...queryKey, "edit"], queryFn: load, staleTime: Infinity, refetchOnWindowFocus: false, gcTime: 0 });

  if (query.isPending) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8 sm:px-6" role="status" aria-label={`Loading ${noun}`}>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 rounded-xl" />
      </main>
    );
  }
  if (query.isError) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <Alert variant="destructive">
          <IconAlertCircle />
          <AlertTitle>Couldn’t load this {noun}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            Check your connection and try again.
            <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>Retry</Button>
          </AlertDescription>
        </Alert>
      </main>
    );
  }
  if (!query.data) return <main className="page-shell">{notFound}</main>;
  const reason = blocked(query.data);
  if (reason) return <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">{reason}</main>;
  return children(query.data);
}
