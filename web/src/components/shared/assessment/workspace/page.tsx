"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { IconAlertCircle } from "@tabler/icons-react";

import { useBreadcrumbTitle } from "@/components/shared/breadcrumb-title";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { AcademyEntry } from "@/modules/academies";
import { AcademyGate } from "@/modules/auth";
import { useAssessmentListReturn } from "../list/return";
import { WorkspaceMissing } from "./missing";

type Props<E extends { title: string }> = {
  id: string;
  /** "assignment", "quiz" or "exam". */
  noun: string;
  /** Route segment of the module, such as "assignments". */
  route: string;
  queryKey: (academyId: string, id: string) => readonly unknown[];
  load: (academyId: string, id: string) => Promise<E | null>;
  /** Re-read on a timer, for phases that move with time. */
  refetchMs?: number;
  children: (academy: AcademyEntry, entity: E) => ReactNode;
};

/**
 * `/app/<route>/<id>`: loads the assessment and shows the loading, error and not-found states; the
 * workspace itself renders through `children`.
 */
export function AssessmentWorkspacePage<E extends { title: string }>({ id, noun, route, queryKey, load, refetchMs, children }: Props<E>) {
  return (
    <AcademyGate>
      {(academy) => (
        <Content key={`${academy.id}:${id}`} academy={academy} id={id} noun={noun} route={route} queryKey={queryKey} load={load} refetchMs={refetchMs}>{children}</Content>
      )}
    </AcademyGate>
  );
}

function Content<E extends { title: string }>({ academy, id, noun, route, queryKey, load, refetchMs, children }: Props<E> & { academy: AcademyEntry }) {
  const query = useQuery({ queryKey: queryKey(academy.id, id), queryFn: () => load(academy.id, id), refetchInterval: refetchMs });
  const back = useAssessmentListReturn(route);
  useBreadcrumbTitle(query.data?.title ?? noun[0].toUpperCase() + noun.slice(1), { label: "Assessments", href: back });
  return (
    <main className="page-shell">
      {query.isPending && (
        <div role="status" aria-label={`Loading ${noun}`} className="flex flex-col gap-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      )}
      {query.isError && (
        <Alert variant="destructive">
          <IconAlertCircle />
          <AlertTitle>{query.data ? `Couldn’t refresh this ${noun}` : `Couldn’t load this ${noun}`}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            {query.data ? "Showing the last loaded details." : "Check your connection and try again."}
            <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>Retry</Button>
          </AlertDescription>
        </Alert>
      )}
      {query.data === null && <WorkspaceMissing noun={noun} route={route} />}
      {query.data && children(academy, query.data)}
    </main>
  );
}
