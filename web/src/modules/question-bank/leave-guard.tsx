import { useBlocker } from "@tanstack/react-router";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

/** Asks before leaving the import page while its in-memory review has unsaved questions. */
export function LeaveGuard({ when }: { when: boolean }) {
  const blocker = useBlocker({
    disabled: !when,
    enableBeforeUnload: when,
    withResolver: true,
    shouldBlockFn: ({ current, next }) => current.pathname !== next.pathname,
  });
  return <AlertDialog open={blocker.status === "blocked"} onOpenChange={open => { if (!open) blocker.reset?.(); }}>
    <AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>Leave this import?</AlertDialogTitle>
        <AlertDialogDescription>Unsaved questions from the current review will be discarded.</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel onClick={() => blocker.reset?.()}>Keep reviewing</AlertDialogCancel>
        <AlertDialogAction onClick={() => blocker.proceed?.()}>Leave</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
