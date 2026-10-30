"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAcademyScope } from "@/modules/auth";
import { typeRootKey } from "../details";
import { CLOSE_DELAY_SECONDS, changeLifecycle, type LifecycleAction } from "../lifecycle";
import { assessmentsRootKey } from "../queries";
import { TYPE_LABELS, type AssessmentRow, type AssessmentType } from "../types";

export type PendingLifecycle = { row: AssessmentRow; action: LifecycleAction; opener: HTMLElement | null };

const copy = (type: AssessmentType, action: LifecycleAction) => {
  const noun = TYPE_LABELS[type].toLowerCase();
  if (type === "assignment") return action === "close"
    ? "No newly received work can be recorded. Staff can still mark work already received and announce results while the year is open."
    : "It becomes read-only and is hidden from the default list. Its history is kept. Archiving can’t be undone.";
  return action === "close"
    ? `New attempts stop in ${CLOSE_DELAY_SECONDS} seconds and it closes for good two minutes later. A later sitting needs a new ${noun}.`
    : `New work stops and the ${noun} becomes read-only. Attempts, submissions, marks and announced results are kept, and solutions still release at actual closure to students who submitted. Archiving isn’t possible while students are still answering.`;
};

/** Confirms a row's Close or Archive, then refreshes the list and the owning module's pages either way. */
export function LifecycleDialog({ academyId, pending, onClose }: { academyId: string; pending: PendingLifecycle | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const isCurrent = useAcademyScope();
  const [running, setRunning] = useState(false);

  async function run({ row: { item }, action }: PendingLifecycle) {
    setRunning(true);
    try {
      const result = await changeLifecycle(academyId, item, action);
      if (!isCurrent(academyId)) return;
      if (!result.ok) { toast.error(result.message); return; }
      toast.success(`${TYPE_LABELS[item.type]} ${action === "close" ? "closing" : "archived"}.`);
      onClose();
    } catch {
      if (isCurrent(academyId)) toast.error("The connection dropped, so we couldn’t confirm whether this was saved. Reload to see the current state before trying again.");
    } finally {
      // A refusal usually means the row is out of date.
      void queryClient.invalidateQueries({ queryKey: assessmentsRootKey(academyId) });
      void queryClient.invalidateQueries({ queryKey: typeRootKey(academyId, item.type) });
      setRunning(false);
    }
  }

  return (
    <AlertDialog open={pending !== null} onOpenChange={(open) => { if (!open && !running) onClose(); }}>
      <AlertDialogContent onCloseAutoFocus={(event) => {
        if (!pending?.opener?.isConnected) return;
        event.preventDefault();
        pending.opener.focus({ preventScroll: true });
      }}>
        {pending && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>{pending.action === "close" ? "Close" : "Archive"} this {TYPE_LABELS[pending.row.item.type].toLowerCase()}?</AlertDialogTitle>
              <AlertDialogDescription>{copy(pending.row.item.type, pending.action)}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={running}>Cancel</AlertDialogCancel>
              <AlertDialogAction variant={pending.action === "archive" ? "destructive" : "default"} disabled={running}
                onClick={(event) => { event.preventDefault(); void run(pending); }}>
                {running ? "Working…" : pending.action === "close" ? "Close" : "Archive"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
