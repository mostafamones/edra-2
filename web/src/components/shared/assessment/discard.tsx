"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Props = { noun: string; open: boolean; onOpenChange: (open: boolean) => void; saving?: boolean; uncertain?: boolean; onDiscard: () => Promise<void> };

/** Confirms leaving an assessment form that has unsaved changes. */
export function DiscardDialog({ noun, open, onOpenChange, onDiscard, saving, uncertain }: Props) {
  const [leaving, setLeaving] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
          <AlertDialogDescription>{uncertain ? "A save outcome is unknown. Stay and retry the original request before leaving." : saving ? "A save is pending. Leaving waits for its outcome; changes already saved will be kept." : `Only unsaved edits to this ${noun} will be discarded. Previously saved changes are kept.`}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep editing</AlertDialogCancel>
          <Button variant="destructive" disabled={leaving || uncertain} onClick={async () => { setLeaving(true); try { await onDiscard(); } finally { setLeaving(false); } }}>{leaving ? "Waiting for save…" : "Discard unsaved changes"}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
