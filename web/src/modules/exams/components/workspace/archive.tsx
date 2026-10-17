"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { IconArchive } from "@tabler/icons-react";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAcademyScope } from "@/modules/auth";
import { archiveExistingExam } from "../../actions";
import { examsRootKey } from "../../queries";
import type { Exam } from "../../types";

/** Owner/Head Admin/Admin. Waits for running attempts; keeps work, results and solution rules. */
export function ArchiveExam({ exam }: { exam: Exam }) {
  const queryClient = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  const [busy, setBusy] = useState(false);
  async function archive() {
    setBusy(true);
    try {
      const result = await archiveExistingExam({ academyId: exam.academyId, examId: exam.id, expectedVersion: exam.version });
      if (!isCurrentAcademy(exam.academyId)) return;
      if (!result.ok) { toast.error(result.message); return; }
      toast.success("Exam archived.");
      void queryClient.invalidateQueries({ queryKey: examsRootKey(exam.academyId) });
    } catch {
      toast.error("The connection dropped, so we couldn’t confirm whether this was saved. Reload to see the current state before trying again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AlertDialog>
      <Tooltip>
        <TooltipTrigger asChild>
          <AlertDialogTrigger asChild><Button variant="outline" size="icon" aria-label="Archive" disabled={busy}><IconArchive /></Button></AlertDialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Archive</TooltipContent>
      </Tooltip>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive this exam?</AlertDialogTitle>
          <AlertDialogDescription>
            New work stops and the exam becomes read-only. Attempts, submissions, marks and announced results are kept, and solutions still release at actual closure to students who submitted. Archiving isn’t possible while students are still answering.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => void archive()}>Archive</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
