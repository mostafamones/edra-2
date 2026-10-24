"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { SettingsRow } from "@/components/shared/settings-row";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { deleteAccount } from "../actions";
import { DELETE_CONFIRMATION } from "../validation";

export function AccountDeletion() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const confirmed = typed.trim().toLowerCase() === DELETE_CONFIRMATION;

  async function confirm() {
    setBusy(true); setError("");
    const result = await deleteAccount(typed).catch(() => ({ ok: false as const, message: "Couldn’t delete your account. Try again." }));
    if (result.ok) {
      router.replace("/");
      router.refresh();
      return;
    }
    setError(result.message);
    setBusy(false);
  }

  return (
    <SettingsRow title="Delete account">
      <AlertDialog open={open} onOpenChange={(next) => { if (busy) return; setOpen(next); setTyped(""); setError(""); }}>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" size="sm">Delete account</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              Your name, phone numbers and picture are erased and you are signed out everywhere. This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="delete-confirmation">Type “{DELETE_CONFIRMATION}” to confirm</Label>
            <Input id="delete-confirmation" autoComplete="off" value={typed} disabled={busy} onChange={(event) => setTyped(event.target.value)} />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={busy || !confirmed} onClick={(event) => { event.preventDefault(); void confirm(); }}>
              {busy ? "Deleting…" : "Delete account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsRow>
  );
}
