"use client";
import { useCanonicalHref } from "@/modules/navigation";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import type { AcademyEntry } from "@/modules/academies";
import { DiscardDialog } from "./discard-dialog";
import { StudentRecordForm, type FormStatus } from "./form";

/** Full-page student form for the create route. */
export function StudentFormPage({ academy, title }: { academy: AcademyEntry; title: string }) {
  const href = useCanonicalHref();
  const router = useRouter();
  const [status, setStatus] = useState<FormStatus>({ dirty: false, saving: false });
  const [confirming, setConfirming] = useState(false);
  const onStatusChange = useCallback((next: FormStatus) => setStatus(next), []);
  const leave = () => router.push(href("/app/students"));

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="font-heading text-2xl font-semibold">{title}</h1>
      <div className="mb-8" />
      <StudentRecordForm
        academy={academy}
        onSaved={leave}
        onCancel={() => { if (status.saving) return; if (status.dirty) setConfirming(true); else leave(); }}
        onStatusChange={onStatusChange}
      />
      <DiscardDialog open={confirming} onOpenChange={setConfirming} onDiscard={leave} />
    </main>
  );
}
