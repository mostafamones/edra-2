import { useState } from "react";
import { toast } from "sonner";

import { TextInput } from "@/components/shared/app-input";
import { IconAlertTriangle, IconLoader2, IconTrash } from "@/components/shared/icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

import { deleteAcademy } from "../actions";
import type { AcademyProfile } from "../validation";

const MESSAGES = {
  sessionExpired: "Your session has ended. Sign in again.",
  forbidden: "Only the academy Owner can delete this academy.",
  nameMismatch: "The name you typed doesn’t match the academy name.",
  deleteFailed: "Couldn’t delete the academy. Nothing was deleted. Try again.",
};

/** Owner-only permanent deletion, confirmed by typing the academy name exactly. */
export function DeleteAcademy({ profile }: { profile: AcademyProfile }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const matches = typed === profile.name;

  async function remove() {
    if (!matches || busy) return;
    setError(""); setBusy(true);
    try {
      const result = await deleteAcademy(profile.slug, typed);
      if (!result.ok) { setError(MESSAGES[result.code]); setBusy(false); return; }
      toast.success(`${profile.name} was permanently deleted`);
      // A full reload drops every cached query and membership for the deleted academy.
      window.location.assign("/app");
    } catch {
      setError("Couldn’t confirm the deletion. Check your connection, then reload to see whether the academy still exists.");
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-destructive/40 p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-destructive">Delete academy</h2>
          <p className="text-sm text-muted-foreground">Permanently deletes this academy and all of its data. This cannot be undone.</p>
        </div>
        <AlertDialog open={open} onOpenChange={(next) => { if (busy) return; setOpen(next); if (!next) { setTyped(""); setError(""); } }}>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="destructive"><IconTrash aria-hidden="true" />Delete academy</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Permanently delete {profile.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                This deletes the academy and everything in it, for everyone, immediately.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Alert variant="destructive">
              <IconAlertTriangle aria-hidden="true" />
              <AlertTitle>This is irreversible</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4">
                  <li>All students, staff access, groups and schedules</li>
                  <li>All sessions, attendance, assignments, quizzes, exams and marks</li>
                  <li>All content, coupons and academic years</li>
                </ul>
                There is no undo, no archive and no restore. Staff and students keep their Edra accounts but lose all access to this academy.
              </AlertDescription>
            </Alert>
            <TextInput label={`Type “${profile.name}” to confirm`} dir="auto" autoComplete="off" spellCheck={false} value={typed}
              disabled={busy} onChange={(event) => setTyped(event.target.value)} />
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" disabled={!matches || busy} onClick={(event) => { event.preventDefault(); void remove(); }}>
                {busy && <IconLoader2 className="animate-spin" aria-hidden="true" />}
                {busy ? "Deleting…" : "Delete this academy forever"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </section>
  );
}
