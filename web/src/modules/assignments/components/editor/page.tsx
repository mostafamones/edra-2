"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { useBreadcrumbTitle } from "@/components/shared/breadcrumb-title";
import type { AcademyEntry } from "@/modules/academies";
import { useCanonicalHref } from "@/modules/navigation";
import type { Assignment } from "../../types";
import { DiscardDialog } from "./discard";
import { AssignmentForm, type FormStatus } from "./form";

/** Full-page assignment form shared by the create and edit routes. Saving opens the workspace. */
export function AssignmentFormPage({ title, academy, assignment }: { title: string; academy: AcademyEntry; assignment?: Assignment }) {
  const href = useCanonicalHref();
  const router = useRouter();
  const [status, setStatus] = useState<FormStatus>({ dirty: false, saving: false });
  const [confirming, setConfirming] = useState(false);
  useBreadcrumbTitle(assignment ? "Edit assignment" : "New assignment");
  const onStatusChange = useCallback((next: FormStatus) => setStatus(next), []);
  const back = href(assignment ? `/app/assignments/${assignment.id}` : "/app/assignments");
  const leave = () => router.push(back);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="mb-8 font-heading text-2xl font-semibold">{title}</h1>
      <AssignmentForm
        academy={academy}
        assignment={assignment}
        onSaved={(saved) => router.push(href(`/app/assignments/${saved.id}`))}
        onCancel={() => { if (status.saving) return; if (status.dirty) setConfirming(true); else leave(); }}
        onStatusChange={onStatusChange}
      />
      <DiscardDialog open={confirming} onOpenChange={setConfirming} onDiscard={leave} />
    </main>
  );
}
