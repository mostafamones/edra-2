"use client";

import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircleIcon } from "@hugeicons/core-free-icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";

/** Read-only composition. A failed read is never empty; refresh failures retain usable data. */
export function QueryContent<T>({ query, label, isEmpty, emptyTitle, emptyAction, loading, children }: {
  query: Pick<UseQueryResult<T, Error>, "data" | "isPending" | "isFetching" | "error"> & { refetch: () => Promise<unknown> };
  label: string;
  isEmpty: (data: T) => boolean;
  emptyTitle: string;
  emptyAction?: ReactNode;
  loading?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  const hasData = query.data !== undefined;
  return <>
    {query.error && <Alert variant="destructive" role="alert">
      <HugeiconsIcon icon={AlertCircleIcon} strokeWidth={1.5} aria-hidden="true" />
      <AlertTitle>{hasData ? `Couldn’t refresh ${label}` : `Couldn’t load ${label}`}</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span className="min-w-0 break-words">{query.error.message}</span>
        <Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}>{query.isFetching ? "Retrying…" : "Retry"}</Button>
      </AlertDescription>
    </Alert>}
    {!hasData ? (!query.error && <div role="status" aria-label={`Loading ${label}`}>
      {loading ?? <div className="space-y-3" aria-hidden="true"><Skeleton className="h-12 w-full rounded-lg" /><Skeleton className="h-32 w-full rounded-lg" /></div>}
    </div>) : <>
      {query.isFetching && !query.error && <span role="status" className="sr-only">Refreshing {label}</span>}
      {isEmpty(query.data!) ? (!query.error && <Empty className="min-h-56 rounded-lg border border-dashed">
        <EmptyHeader><EmptyTitle>{emptyTitle}</EmptyTitle></EmptyHeader>
        {emptyAction && <EmptyContent>{emptyAction}</EmptyContent>}
      </Empty>) : children(query.data!)}
    </>}
  </>;
}
