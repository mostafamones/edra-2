"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAcademyScope } from "@/modules/auth";
import { deleteSession } from "../actions";
import { sessionsRootKey } from "../queries";

type Props = { academyId: string; sessionId: string; title: string; open: boolean; onClose: () => void };

/** Confirms deleting a finished session. The server refuses once its attendance was published. */
export function DeleteSessionDialog({ academyId, sessionId, title, open, onClose }: Props) {
  const queryClient = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    if (busy) return;
    const targetAcademyId = academyId;
    setError(""); setBusy(true);
    try {
      const result = await deleteSession({ academyId: targetAcademyId, sessionId });
      if (!result.ok) { if (isCurrentAcademy(targetAcademyId)) setError(result.message); return; }
      await queryClient.invalidateQueries({ queryKey: sessionsRootKey(targetAcademyId) });
      if (!isCurrentAcademy(targetAcademyId)) return;
      toast.success(`${title} was deleted.`);
      onClose();
    } catch {
      if (isCurrentAcademy(targetAcademyId)) setError("Could not delete the session. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next && !busy) { setError(""); onClose(); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {title}?</AlertDialogTitle>
          <AlertDialogDescription>This removes the session, its roster and any unpublished attendance. It can’t be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={(event) => { event.preventDefault(); void remove(); }} disabled={busy}>
            {busy ? "Deleting…" : "Delete session"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
