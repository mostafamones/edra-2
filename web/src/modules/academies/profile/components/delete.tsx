import { useState } from "react";

import { SettingsGroup } from "@/components/shared/settings-group";
import { SettingsRow } from "@/components/shared/settings-row";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLeaveDeletedAcademy, usePreviewStatus } from "@/modules/development";

import { deleteAcademy } from "../actions";
import type { AcademyProfile } from "../validation";

const MESSAGES = {
  sessionExpired: "Your session has ended. Sign in again.",
  forbidden: "Only the academy Owner can delete this academy.",
  nameMismatch: "The name you typed doesn’t match the academy name.",
  deleteFailed: "Couldn’t delete the academy. Try again.",
};

/** Owner-only permanent deletion, confirmed by typing the academy name exactly. Mirrors account deletion. */
export function DeleteAcademy({ profile }: { profile: AcademyProfile }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const confirmed = typed === profile.name;
  const preview = usePreviewStatus().data;
  const leavePreview = useLeaveDeletedAcademy();

  async function confirm() {
    setBusy(true); setError("");
    // Read before deleting: the preview status of a deleted academy may no longer load.
    const before = preview;
    const result = await deleteAcademy(profile.slug, typed).catch(() => ({ ok: false as const, code: "deleteFailed" as const }));
    if (result.ok) {
      // In Developer mode, move to the next generated academy or exit the preview.
      if (await leavePreview(profile.slug, before)) return;
      // A full reload drops every cached query and membership for the deleted academy.
      window.location.assign("/app");
      return;
    }
    setError(MESSAGES[result.code]);
    setBusy(false);
  }

  return (
    <SettingsGroup title="Danger zone">
      <SettingsRow title="Delete academy">
        <AlertDialog open={open} onOpenChange={(next) => { if (busy) return; setOpen(next); setTyped(""); setError(""); }}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm">Delete academy</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Permanently delete {profile.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                This is irreversible. All students, staff access, sessions, attendance, assessments, marks, content, coupons and
                uploaded files are erased for everyone. There is no undo, archive or restore.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex flex-col gap-2">
              <Label htmlFor="delete-academy-confirmation">Type “{profile.name}” to confirm</Label>
              <Input id="delete-academy-confirmation" dir="auto" autoComplete="off" spellCheck={false} value={typed} disabled={busy}
                onChange={(event) => setTyped(event.target.value)} />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" disabled={busy || !confirmed} onClick={(event) => { event.preventDefault(); void confirm(); }}>
                {busy ? "Deleting…" : "Delete academy"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SettingsRow>
    </SettingsGroup>
  );
}
