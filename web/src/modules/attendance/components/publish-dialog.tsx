"use client";

import { newUuid } from "@/lib/uuid";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAcademyScope } from "@/modules/auth";
import { ContentTaughtReview, taughtRootKey } from "@/modules/content";
import { publishReviewedAttendance } from "../actions";
import { attendanceQueryKey } from "../queries";
import type { AttendanceSheet } from "../types";
import { STATUS_LABELS } from "./labels";

type Props = { sheet: AttendanceSheet; onClose: () => void };

/**
 * Reviews and finalizes the attendance revision shown when the dialog opened. Mount it only while
 * open. If anyone saves in the meantime, finalizing that review is rejected as stale and the dialog
 * asks for a fresh review of the latest values.
 */
export function PublishDialog({ sheet, onClose }: Props) {
  const queryClient = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reviewed, setReviewed] = useState(sheet.revision);
  const [key, setKey] = useState(() => newUuid());
  const changedSinceReview = sheet.revision !== reviewed;
  const academyId = sheet.session.academyId;
  const correction = sheet.publicationCount > 0;
  const changes = sheet.entries.filter((entry) => entry.correctionPending).length;
  const counts = sheet.counts;

  async function publish() {
    if (busy) return;
    setError(""); setBusy(true);
    try {
      // One key per reviewed revision, reused if the same review is retried.
      const result = await publishReviewedAttendance({
        academyId, sessionId: sheet.session.id, expectedRevision: reviewed, idempotencyKey: key,
      });
      await queryClient.invalidateQueries({ queryKey: attendanceQueryKey(academyId, sheet.session.id) });
      await queryClient.invalidateQueries({ queryKey: taughtRootKey(academyId, sheet.session.id) });
      if (!isCurrentAcademy(academyId)) return;
      if (!result.ok) { setError(result.message); return; }
      toast.success(result.outcome === "published"
        ? correction ? "Corrections finalized." : "Attendance finalized."
        : "Attendance was already up to date.");
      onClose();
    } catch {
      if (isCurrentAcademy(academyId)) setError("Could not finalize. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function reviewLatest() {
    setReviewed(sheet.revision);
    setKey(newUuid());
    setError("");
  }

  return (
    <AlertDialog open onOpenChange={(next) => { if (!next && !busy) { setError(""); onClose(); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{correction ? "Finalize corrections?" : "Finalize attendance?"}</AlertDialogTitle>
          <AlertDialogDescription>
            {correction
              ? `${changes} ${changes === 1 ? "student has" : "students have"} a change since attendance was last finalized. Finalized values stay official until you finalize again.`
              : "These values become official. Unknown stays Unknown; nobody is marked absent automatically."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <dl className="grid grid-cols-3 gap-2 text-sm sm:grid-cols-5">
          {(["present", "late", "absent", "excused", "unknown"] as const).map((status) => (
            <div key={status} className="rounded-lg border border-border px-3 py-2">
              <dt className="text-xs text-muted-foreground">{STATUS_LABELS[status]}</dt>
              <dd className="font-semibold tabular-nums">{counts[status]}</dd>
            </div>
          ))}
        </dl>
        <ContentTaughtReview academyId={academyId} sessionId={sheet.session.id} correction={correction} />
        {changedSinceReview && (
          <p role="status" className="text-sm text-muted-foreground">
            Attendance changed while you were reviewing. The counts above are the latest values.
          </p>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          {changedSinceReview ? (
            <AlertDialogAction onClick={(event) => { event.preventDefault(); reviewLatest(); }} disabled={busy}>
              I’ve reviewed the latest
            </AlertDialogAction>
          ) : (
            <AlertDialogAction onClick={(event) => { event.preventDefault(); void publish(); }} disabled={busy}>
              {busy ? "Finalizing…" : "Finalize"}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
