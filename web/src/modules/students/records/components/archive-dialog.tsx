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
import { setStudentRecordsArchived } from "../actions";
import { studentsRootKey } from "../queries";
import type { RecordVersion } from "../types";

export type ArchiveRequest = {
  archive: boolean;
  records: RecordVersion[];
  /** The student's name for a single record; omitted for a bulk action. */
  name?: string;
};

type Props = {
  academyId: string;
  academicYearId: string | null;
  request: ArchiveRequest | null;
  onClose: () => void;
  /** Called with the ids that changed after a successful archive or restore. */
  onDone: (ids: string[]) => void;
};

const students = (count: number) => `${count} ${count === 1 ? "student" : "students"}`;

/** Confirms archiving or restoring the exact set of records, then applies it atomically. */
export function ArchiveDialog({ academyId, academicYearId, request, onClose, onDone }: Props) {
  const queryClient = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const count = request?.records.length ?? 0;
  const subject = request?.name ?? students(count);
  const verb = request?.archive ? "Archive" : "Restore";

  async function confirm() {
    if (!request || !academicYearId) return;
    const targetAcademyId = academyId;
    setBusy(true); setError("");
    try {
      const result = await setStudentRecordsArchived(targetAcademyId, academicYearId, request.records, request.archive);
      if (!result.ok) {
        if (!isCurrentAcademy(targetAcademyId)) return;
        setError(result.code === "stale_record" || result.code === "not_found"
          ? "Some of these students changed since you selected them. Nothing was changed; reload the list and try again."
          : result.message);
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: studentsRootKey(targetAcademyId) }),
        queryClient.invalidateQueries({ queryKey: groupDependencyQueryKey(targetAcademyId) }),
      ]);
      if (!isCurrentAcademy(targetAcademyId)) return;
      toast.success(`${request.archive ? "Archived" : "Restored"} ${subject}.`);
      onDone(result.data.ids);
      onClose();
    } catch {
      if (isCurrentAcademy(targetAcademyId)) setError(`Could not ${verb.toLowerCase()} ${subject}. Check your connection and try again.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={Boolean(request)} onOpenChange={(open) => { if (!open && !busy) { setError(""); onClose(); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{verb} {subject}?</AlertDialogTitle>
          <AlertDialogDescription>
            {request?.archive
              ? "Archived students are hidden from the default list and can’t be edited until restored. Their phone numbers stay reserved for this year."
              : "Restored students return to the active list and can be edited again."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={request?.archive ? "destructive" : "default"}
            disabled={busy || !academicYearId}
            onClick={(event) => { event.preventDefault(); void confirm(); }}
          >
            {busy ? `${verb === "Archive" ? "Archiving" : "Restoring"}…` : `${verb} ${students(count)}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
