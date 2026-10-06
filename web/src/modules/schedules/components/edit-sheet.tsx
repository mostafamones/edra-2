"use client";

import { useCallback, useState } from "react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { AcademyEntry } from "@/modules/academies";
import type { Schedule, ScheduleSession, ScheduleSlot } from "../queries";
import { DiscardDialog } from "./discard-dialog";
import { ScheduleForm, type FormStatus } from "./schedule-form";

type Props = {
  academy: AcademyEntry;
  /** The schedule being edited; null closes the sheet. */
  editing: { schedule: Schedule; slots: ScheduleSlot[]; sessions: ScheduleSession[] } | null;
  onClose: () => void;
};

/** Side sheet that edits a whole schedule. Saving blocks dismissal; unsaved edits ask first. */
export function ScheduleEditSheet({ academy, editing, onClose }: Props) {
  const [status, setStatus] = useState<FormStatus>({ dirty: false, saving: false });
  const [confirming, setConfirming] = useState(false);
  const onStatusChange = useCallback((next: FormStatus) => setStatus(next), []);

  function close() {
    setStatus({ dirty: false, saving: false });
    setConfirming(false);
    onClose();
  }

  function requestClose() {
    if (status.saving) return;
    if (status.dirty) setConfirming(true);
    else close();
  }

  return (
    <>
      <Sheet open={Boolean(editing)} onOpenChange={(open) => { if (!open) requestClose(); }}>
        <SheetContent
          side="right"
          showCloseButton={!status.saving}
          className="gap-0 overflow-hidden p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
        >
          <SheetHeader className="shrink-0 border-b px-6 py-5 pr-16">
            <SheetTitle className="text-xl">Edit schedule</SheetTitle>
            <SheetDescription className="wrap-break-words">{editing?.schedule.title}</SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col">
            {editing && (
              <ScheduleForm
                key={editing.schedule.id}
                academy={academy}
                schedule={editing.schedule}
                slots={editing.slots}
                sessions={editing.sessions}
                variant="sheet"
                onSaved={close}
                onCancel={requestClose}
                onStatusChange={onStatusChange}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
      <DiscardDialog open={confirming} onOpenChange={setConfirming} onDiscard={close} />
    </>
  );
}
