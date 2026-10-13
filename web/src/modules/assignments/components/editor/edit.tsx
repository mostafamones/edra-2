"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { IconAlertCircle, IconArrowLeft } from "@tabler/icons-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { AcademyEntry } from "@/modules/academies";
import { AcademyGate } from "@/modules/auth";
import { useCanonicalHref } from "@/modules/navigation";
import { assignmentPermissions } from "../../permissions";
import { assignmentQueryKey, loadAssignment } from "../../queries";
import { AssignmentFormPage } from "./page";
import { NotFound } from "../shared/not-found";

/** `/app/assignments/<id>/edit`: the whole setup until marking starts, then only text details (Owner/Head Admin/Admin). */
export function EditAssignmentPage({ id }: { id: string }) {
  return <AcademyGate>{(academy) => <EditContent academy={academy} assignmentId={id} />}</AcademyGate>;
}

function EditContent({ academy, assignmentId }: { academy: AcademyEntry; assignmentId: string }) {
  const href = useCanonicalHref();
  // Never refetch underneath an open form: the expected version is the one the editor started from.
  const query = useQuery({
    queryKey: [...assignmentQueryKey(academy.id, assignmentId), "edit"],
    queryFn: () => loadAssignment(academy.id, assignmentId),
    staleTime: Infinity, refetchOnWindowFocus: false, gcTime: 0,
  });

  if (query.isPending) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8 sm:px-6" role="status" aria-label="Loading assignment">
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
          <AlertTitle>Couldn’t load this assignment</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            Check your connection and try again.
            <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>Retry</Button>
          </AlertDescription>
        </Alert>
      </main>
    );
  }
  const assignment = query.data;
  if (!assignment) return <main className="page-shell"><NotFound /></main>;
  if (!assignmentPermissions(academy.role, assignment).edit) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <Alert>
          <IconAlertCircle />
          <AlertTitle>This assignment can’t be edited</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3">
            {assignment.state === "archived" || !assignment.yearOpen
              ? "Archived assignments and assignments of a closed academic year are read-only."
              : "Only an Owner or Admin can edit an assignment once marking has started."}
            <Button variant="outline" size="sm" asChild><Link href={href(`/app/assignments/${assignment.id}`)}><IconArrowLeft />Back to assignment</Link></Button>
          </AlertDescription>
        </Alert>
      </main>
    );
  }
  const title = assignmentPermissions(academy.role, assignment).editStructure ? "Edit assignment" : "Edit assignment details";
  return <AssignmentFormPage title={title} academy={academy} assignment={assignment} />;
}
