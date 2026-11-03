import { useLayoutEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { formatAcademyDateTime } from "@/lib/academy-time";
import { newUuid } from "@/lib/uuid";
import { useAcademyScope, useAuth } from "@/modules/auth";
import { changeStudentAnswerAccess, loadAnswerAccess } from "../../actions";
import type { Assignment } from "../../types";

/**
 * A student's earned answer-video access. Managers revoke it for invalid qualifying work or restore
 * it while that work remains valid; every change keeps its reason in the history.
 */
export function AnswerAccess({ assignment, recordId, manager }: { assignment: Assignment; recordId: string; manager: boolean }) {
  const client = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  const { session } = useAuth();
  const identity = JSON.stringify([session?.user.id, assignment.academyId, assignment.id, recordId]);
  const current = useRef<object | null>(null);
  useLayoutEffect(() => { current.current = {}; return () => { current.current = null; }; }, [identity]);
  const key = ["assignments", assignment.academyId, assignment.id, "answer-access", recordId];
  const query = useQuery({ queryKey: key, queryFn: async () => {
    const result = await loadAnswerAccess({ academyId: assignment.academyId, assignmentId: assignment.id, recordId });
    if (!result.ok) throw new Error(result.message);
    return result.data;
  } });
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState(newUuid);
  const data = query.data;
  if (query.isPending) return <p role="status" className="text-sm text-muted-foreground">Loading answer access…</p>;
  if (query.isError) return <div role="alert" className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm"><span>Could not load answer access.</span><Button variant="outline" size="sm" onClick={() => void query.refetch()}>Retry answer access</Button></div>;
  if (!data?.hasAnswerVideos || (!data.qualifyingWork && data.history.length === 0)) return null;
  const action = data.revoked ? "restore" : "revoke";

  async function confirm() {
    const started = current.current;
    setBusy(true);
    setError(null);
    const isCurrent = () => Boolean(started && current.current === started && isCurrentAcademy(assignment.academyId));
    try {
      const result = await changeStudentAnswerAccess({ academyId: assignment.academyId, assignmentId: assignment.id, recordId, action, reason, requestId });
      if (!isCurrent()) return;
      if (!result.ok) { setError(result.message); if (result.code !== "unavailable") setRequestId(newUuid()); return; }
      client.setQueryData(key, result.data);
      setOpen(false);
      setReason("");
      setRequestId(newUuid());
    } catch {
      if (isCurrent()) setError("Could not confirm the access change. Retry with the same reason.");
    } finally {
      if (isCurrent()) setBusy(false);
    }
  }

  return (
    <section aria-label="Answer access" className="flex flex-col gap-2 rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-medium">
          Answer access
          <Badge variant={data.revoked || !data.qualifyingWork ? "outline" : "secondary"}>
            {data.revoked ? "Revoked" : data.qualifyingWork ? "Unlocked" : "Locked"}
          </Badge>
        </span>
        {manager && data.qualifyingWork && (
          <AlertDialog open={open} onOpenChange={(next) => { if (!busy) { setOpen(next); setError(null); } }}>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="outline" size="sm">{action === "revoke" ? "Revoke access" : "Restore access"}</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{action === "revoke" ? "Revoke answer access?" : "Restore answer access?"}</AlertDialogTitle>
              </AlertDialogHeader>
              <Field>
                <FieldLabel htmlFor={`answer-access-reason-${recordId}`}>Reason</FieldLabel>
                <Textarea id={`answer-access-reason-${recordId}`} value={reason} maxLength={1000} disabled={busy} onChange={(event) => setReason(event.target.value)} />
              </Field>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
                <AlertDialogAction disabled={busy || !reason.trim()} onClick={(event) => { event.preventDefault(); void confirm(); }}>
                  {action === "revoke" ? "Revoke" : "Restore"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
      {data.history.length > 0 && (
        <ul className="flex flex-col gap-1 text-muted-foreground">
          {data.history.map((entry) => (
            <li key={`${entry.createdAt}-${entry.action}`}>
              {entry.action === "revoke" ? "Revoked" : "Restored"} by {entry.actor} · <time dateTime={entry.createdAt}>{formatAcademyDateTime(entry.createdAt)}</time> · {entry.reason}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
