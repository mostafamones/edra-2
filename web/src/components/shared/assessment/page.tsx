"use client";

import { useCallback, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { useBreadcrumbTitle } from "@/components/shared/breadcrumb-title";
import { useCanonicalHref } from "@/modules/navigation";
import { DiscardDialog } from "./discard";
import { useAssessmentListReturn } from "./list/return";

export type FormStatus = { dirty: boolean; saving: boolean; uncertain?: boolean; discard?: () => Promise<boolean> };

type Handlers<E> = { onSaved: (entity: E) => void; onCancel: () => void; onStatusChange: (status: FormStatus) => void };

type Props<E extends { id: string }> = {
  /** "assignment", "quiz" or "exam". */
  noun: string;
  /** Route segment of the module, such as "assignments". */
  route: string;
  title: string;
  entity?: E;
  children: (handlers: Handlers<E>) => ReactNode;
};

/** Full-page frame shared by every assessment form. Saving opens the workspace; leaving with unsaved edits asks first. */
export function AssessmentFormPage<E extends { id: string }>({ noun, route, title, entity, children }: Props<E>) {
  const href = useCanonicalHref();
  const router = useRouter();
  const [status, setStatus] = useState<FormStatus>({ dirty: false, saving: false });
  const [confirming, setConfirming] = useState(false);
  const back = useAssessmentListReturn(route);
  useBreadcrumbTitle(`${entity ? "Edit" : "New"} ${noun}`, { label: "Assessments", href: back });
  const onStatusChange = useCallback((next: FormStatus) => {
    setStatus((before) => before.dirty === next.dirty && before.saving === next.saving && before.uncertain === next.uncertain ? before : next);
  }, []);
  const leave = () => router.push(entity ? href(`/app/${route}/${entity.id}`) : back);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="mb-8 text-2xl font-semibold">{title}</h1>
      {children({
        onSaved: (saved) => router.push(href(`/app/${route}/${saved.id}`)),
        onCancel: () => { if (status.dirty || status.saving || status.uncertain) setConfirming(true); else leave(); },
        onStatusChange,
      })}
      <DiscardDialog noun={noun} open={confirming} onOpenChange={setConfirming} saving={status.saving} uncertain={status.uncertain} onDiscard={async () => { if (await status.discard?.() !== false) leave(); }} />
    </main>
  );
}
