"use client";

import { useState } from "react";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

import type { Answers, EditorDocument } from "../types";

type Props = { doc: EditorDocument; answers: Answers; dueAt: string | null; conflicts: number; busy: boolean; onSubmit: () => Promise<string | null> };

/**
 * The one explicit final submission. Blank choices are warned about but allowed; every Written Work
 * part needs at least one uploaded file, and saves and uploads must finish first.
 */
export function StudentAssignmentSubmit({ doc, answers, dueAt, conflicts, busy, onSubmit }: Props) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unanswered = doc.parts.filter((part) => part.kind !== "file_upload").flatMap((part) => part.questions).filter((question) => !answers[question.id]).length;
  const missing = doc.parts.filter((part) => part.kind === "file_upload" && !doc.files.some((file) => file.partId === part.id && file.state === "complete"));
  const unfinished = doc.files.some((file) => file.state === "pending");
  const [late, setLate] = useState(false);

  async function confirm() {
    setSending(true);
    setError(await onSubmit());
    setSending(false);
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!sending) { setOpen(next); setError(null); if (next) setLate(dueAt !== null && Date.now() > Date.parse(dueAt)); } }}>
      <AlertDialogTrigger asChild><Button disabled={busy}>Submit assignment</Button></AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Submit assignment?</AlertDialogTitle>
          <AlertDialogDescription>You can submit only once.</AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
          {unanswered > 0 && <li>{unanswered === 1 ? "1 question is unanswered." : `${unanswered} questions are unanswered.`}</li>}
          {late && <li>This submission will be late.</li>}
          {missing.map((part) => <li key={part.id} className="text-destructive">Upload at least one file for {part.title}.</li>)}
          {unfinished && <li className="text-destructive">Remove uploads that didn’t finish.</li>}
          {conflicts > 0 && <li className="text-destructive">Choose which answer to keep for {conflicts === 1 ? "1 question" : `${conflicts} questions`} first.</li>}
        </ul>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={sending}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={sending || busy || missing.length > 0 || unfinished || conflicts > 0} onClick={(event) => { event.preventDefault(); void confirm(); }}>
            {sending ? "Submitting…" : "Submit"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
