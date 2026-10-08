"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAcademyScope } from "@/modules/auth";
import { useCanonicalHref } from "@/modules/navigation";
import { endSession } from "../actions";
import { sessionsRootKey } from "../queries";

type Props = { academyId: string; sessionId: string; title: string; open: boolean; onClose: () => void };

/** Confirms ending a live session. Ending is final and never records or publishes attendance. */
export function EndSessionDialog({ academyId, sessionId, title, open, onClose }: Props) {
  const router = useRouter();
  const href = useCanonicalHref();
  const queryClient = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function end() {
    if (busy) return;
    const targetAcademyId = academyId;
    setError(""); setBusy(true);
    try {
      const result = await endSession({ academyId: targetAcademyId, sessionId });
      if (!result.ok) { if (isCurrentAcademy(targetAcademyId)) setError(result.message); return; }
      await queryClient.invalidateQueries({ queryKey: sessionsRootKey(targetAcademyId) });
      if (!isCurrentAcademy(targetAcademyId)) return;
      toast.success(result.outcome === "already_ended" ? "Another staff member already ended this session." : `${title} has ended.`);
      onClose();
      router.push(href("/app/attendance"));
    } catch {
      if (isCurrentAcademy(targetAcademyId)) setError("Could not end the session. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next && !busy) { setError(""); onClose(); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>End {title}?</AlertDialogTitle>
          <AlertDialogDescription>This can’t be undone. Attendance isn’t marked or published.</AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={(event) => { event.preventDefault(); void end(); }} disabled={busy}>
            {busy ? "Ending…" : "End session"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
