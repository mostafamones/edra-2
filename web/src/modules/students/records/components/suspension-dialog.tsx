import { useState } from "react";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import type { SuspensionRequest } from "../use-suspension";
import { MAX_SUSPENSION_REASON } from "../validation";

type Props = {
  request: SuspensionRequest | null;
  onClose: () => void;
  /** Starts the write; the confirmation closes and the change shows at once. */
  onConfirm: (request: SuspensionRequest, reason: string) => void;
};

const students = (count: number) => `${count} ${count === 1 ? "student" : "students"}`;

/**
 * Shared confirmation for suspending or restoring online access, for one record or a selection. It
 * opens ready with the state last seen on screen. After a failed write it reopens with the reason
 * and the error; the server rejects any target that moved since, so nothing stale is applied.
 */
export function SuspensionDialog({ request, onClose, onConfirm }: Props) {
  return (
    <AlertDialog open={Boolean(request)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <AlertDialogContent>
        {/* Each request starts from its own reason, error and targets. */}
        {request && <Body key={JSON.stringify([request.suspend, request.targets, request.error ?? ""])} request={request} onConfirm={onConfirm} />}
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Body({ request, onConfirm }: { request: SuspensionRequest; onConfirm: Props["onConfirm"] }) {
  const [reason, setReason] = useState(request.reason ?? "");
  const missing = request.missing ?? 0;
  // Restoring manual suspension leaves archival suspension in place.
  const stillArchived = request.suspend ? 0 : request.targets.filter((target) => target.suspended && target.archived).length;
  const subject = request.name ?? students(request.targets.length + missing);
  const tooLong = reason.trim().length > MAX_SUSPENSION_REASON;

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{request.suspend ? "Suspend" : "Restore"} online access for {subject}?</AlertDialogTitle>
        <AlertDialogDescription asChild>
          <div className="space-y-1">
            {missing > 0 && <span className="block text-destructive">{students(missing)} no longer exist. Close and reselect.</span>}
            {missing === 0 && stillArchived > 0 && <span className="block">{stillArchived} archived: online access stays suspended until restored</span>}
          </div>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <Field data-invalid={tooLong || undefined}>
        <FieldLabel htmlFor="suspension-reason">Reason (optional)</FieldLabel>
        <Textarea id="suspension-reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={3}
          maxLength={MAX_SUSPENSION_REASON} aria-invalid={tooLong || undefined} />
      </Field>
      {request.error && <p role="alert" className="text-sm text-destructive">{request.error}</p>}
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          variant={request.suspend ? "destructive" : "default"}
          disabled={missing > 0 || request.targets.length === 0 || tooLong}
          onClick={() => onConfirm(request, reason)}
        >
          {request.suspend ? "Suspend" : "Restore"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  );
}
