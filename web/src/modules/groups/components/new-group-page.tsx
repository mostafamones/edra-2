"use client";
import { useCanonicalHref } from "@/modules/navigation";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { IconAlertTriangle } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { AcademyGate } from "@/modules/auth";
import { isAcademyManager, type AcademyEntry } from "@/modules/academies";
import { loadStructure, structureQueryKey } from "../queries";
import { GroupForm } from "./group-form";

export function NewGroupPage() {
  return <AcademyGate>{(academy) => <NewGroupContent academy={academy} />}</AcademyGate>;
}

function NewGroupContent({ academy }: { academy: AcademyEntry }) {
  const href = useCanonicalHref();
  const router = useRouter();
  const canManage = isAcademyManager(academy.role);
  const query = useQuery({ queryKey: structureQueryKey(academy.id), queryFn: () => loadStructure(academy.id), enabled: canManage });
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8 md:px-8">
      <h1 className="text-2xl font-semibold">Create group</h1>
      <p className="mt-1 mb-8 text-sm text-muted-foreground">Set up a class group for your students.</p>

      {!canManage && <p role="alert">Only academy Owners, Head Admins and Admins can create groups.</p>}

      {canManage && query.isPending && (
        <div role="status" aria-live="polite" className="space-y-5">
          <span className="sr-only">Loading academy programs…</span>
          <div aria-hidden="true" className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div aria-hidden="true" className="space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div aria-hidden="true" className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div aria-hidden="true" className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-24 w-full" />
          </div>
          <div aria-hidden="true" className="flex justify-end gap-2 pt-2">
            <Skeleton className="h-10 w-20" />
            <Skeleton className="h-10 w-28" />
          </div>
        </div>
      )}

      {canManage && query.isError && (
        <Alert variant="destructive" className="mt-8">
          <IconAlertTriangle aria-hidden="true" />
          <AlertTitle>Couldn’t load academy programs</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3">
            <span>We couldn’t load the levels for the active academy. Try again.</span>
            <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
              {query.isFetching ? "Retrying…" : "Try again"}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {canManage && query.data && (query.data.levels.length ? (
        <GroupForm
          academy={academy}
          levels={query.data.levels}
          tracks={query.data.tracks}
          levelNames={query.data.levelNames}
          onSaved={() => router.push(href("/app/groups"))}
          onCancel={() => router.push(href("/app/groups"))}
        />
      ) : <p role="alert">Add a level to your academy before creating a group.</p>)}
    </main>
  );
}
