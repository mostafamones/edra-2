"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAcademyScope } from "@/modules/auth";
import { groupDependencyQueryKey } from "@/modules/groups";
import { archiveSchedule } from "../actions";
import { schedulesRootKey, type Schedule } from "../queries";

type Props = {
  academyId: string;
  /** The schedule to archive; null closes the dialog. */
  schedule: Schedule | null;
  onClose: () => void;
};

/** Confirms archiving a schedule. Archived schedules leave the active list and can no longer be edited. */
export function ArchiveDialog({ academyId, schedule, onClose }: Props) {
  const queryClient = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function archive() {
    if (!schedule || busy) return;
    const targetAcademyId = academyId;
    setError(""); setBusy(true);
    try {
      const result = await archiveSchedule(targetAcademyId, schedule.id);
      if (!result.ok) { if (isCurrentAcademy(targetAcademyId)) setError(result.message); return; }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: schedulesRootKey(targetAcademyId) }),
        queryClient.invalidateQueries({ queryKey: groupDependencyQueryKey(targetAcademyId) }),
      ]);
      if (!isCurrentAcademy(targetAcademyId)) return;
      toast.success(`${schedule.title} was archived.`);
      onClose();
    } catch {
      if (isCurrentAcademy(targetAcademyId)) setError("Could not archive the schedule. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={Boolean(schedule)} onOpenChange={(open) => { if (!open && !busy) { setError(""); onClose(); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive {schedule?.title}?</AlertDialogTitle>
          <AlertDialogDescription>
            It moves to Archived for this academic year and can no longer be edited.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={(event) => { event.preventDefault(); void archive(); }} disabled={busy}>
            {busy ? "Archiving…" : "Archive schedule"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
