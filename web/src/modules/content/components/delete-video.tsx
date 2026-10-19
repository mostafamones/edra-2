"use client";
import { useState } from "react";
import { IconTrash } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { permanentlyDeleteVideo } from "../media-actions";
import { unwrapContent } from "../types";

export function DeleteVideo({ academyId, assetId, name, disabled, pending, onDeleted }: { academyId: string; assetId: string; name: string; disabled: boolean; pending: boolean; onDeleted: () => Promise<void> }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function remove() {
    setBusy(true); setError("");
    try { unwrapContent(await permanentlyDeleteVideo(academyId, assetId)); }
    catch (e) { setError(e instanceof Error ? e.message : "Deletion could not finish. Retry it."); setBusy(false); return; }
    setOpen(false);
    try { await onDeleted(); }
    catch { setError("Video deleted. Reload this page to update the file list."); }
    finally { setBusy(false); }
  }
  return <><AlertDialog open={open} onOpenChange={value => { if (!busy) { setOpen(value); setError(""); } }}>
    <AlertDialogTrigger asChild><Button variant="destructive" size="sm" disabled={disabled || busy}><IconTrash />{pending ? "Retry deletion" : "Delete permanently"}</Button></AlertDialogTrigger>
    <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Permanently delete this video?</AlertDialogTitle><AlertDialogDescription>Delete “{name}” from Edra and Mux. This cannot be undone. Videos still used by saved units or published history cannot be deleted.</AlertDialogDescription></AlertDialogHeader>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={busy} onClick={event => { event.preventDefault(); void remove(); }}>{busy ? "Deleting…" : "Delete from Edra and Mux"}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>{!open && error && <p role="alert" className="text-sm text-destructive">{error}</p>}</>;
}
