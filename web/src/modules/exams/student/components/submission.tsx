"use client";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unanswered: number;
  flagged: number;
  /** Answers changed elsewhere that the student must resolve first. */
  conflicts: number;
  onSubmit: () => void;
};

/** Submit exam confirmation: the unanswered count, Return or Submit. Blank answers never block submission. */
export function StudentExamSubmitDialog({ open, onOpenChange, unanswered, flagged, conflicts, onSubmit }: Props) {
  const summary = conflicts > 0
    ? `Resolve ${conflicts} ${conflicts === 1 ? "answer" : "answers"} changed in another tab or device first.`
    : unanswered === 0 ? "All questions answered." : `${unanswered} ${unanswered === 1 ? "question" : "questions"} unanswered.`;
  const flags = conflicts === 0 && flagged > 0 ? ` ${flagged} ${flagged === 1 ? "question" : "questions"} flagged.` : "";
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Submit exam?</AlertDialogTitle>
          <AlertDialogDescription>{summary}{flags}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Return</AlertDialogCancel>
          <AlertDialogAction disabled={conflicts > 0} onClick={onSubmit}>Submit</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
