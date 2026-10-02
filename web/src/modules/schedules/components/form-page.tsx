"use client";

import { useCallback, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { DiscardDialog } from "./discard-dialog";
import { ScheduleForm, type FormStatus } from "./schedule-form";

type Props = Omit<React.ComponentProps<typeof ScheduleForm>, "onSaved" | "onCancel" | "onStatusChange" | "variant"> & {
  title: string;
  description?: ReactNode;
};

/** Full-page schedule form shared by the create route and the direct edit route. */
export function ScheduleFormPage({ title, description, ...formProps }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<FormStatus>({ dirty: false, saving: false });
  const [confirming, setConfirming] = useState(false);
  const onStatusChange = useCallback((next: FormStatus) => setStatus(next), []);
  const leave = () => router.push("/app/schedules");

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="font-heading text-2xl font-semibold">{title}</h1>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      <div className="mb-8" />
      <ScheduleForm
        {...formProps}
        onSaved={leave}
        onCancel={() => { if (status.saving) return; if (status.dirty) setConfirming(true); else leave(); }}
        onStatusChange={onStatusChange}
      />
      <DiscardDialog open={confirming} onOpenChange={setConfirming} onDiscard={leave} />
    </main>
  );
}
