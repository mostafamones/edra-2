"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { newUuid } from "@/lib/uuid";
import { useAcademyScope } from "@/modules/auth";
import { markRemainingAbsent } from "../actions";
import { attendanceQueryKey } from "../queries";
import type { AttendanceSheet, UnrecordedAbsenceResult } from "../types";

type Props = { sheet: AttendanceSheet; unrecorded: number; onClose: () => void };

const RETRYABLE = new Set(["unavailable", "throttled"]);

/**
 * Marks every expected student still Unknown Absent, against the revision reviewed when the dialog
 * opened. Mount it only while open. The key is kept for that review, so a retry after an uncertain
 * outcome is the same command; a newer save requires reviewing the latest values first.
 */
export function AbsenceDialog({ sheet, unrecorded, onClose }: Props) {
  const queryClient = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reviewed, setReviewed] = useState(sheet.revision);
  const [key, setKey] = useState(() => newUuid());
  const [stale, setStale] = useState(false);
  const changedSinceReview = stale || sheet.revision !== reviewed;
  const academyId = sheet.session.academyId;

  async function confirm() {
    if (busy) return;
    setError(""); setBusy(true);
    let result: UnrecordedAbsenceResult;
    try {
      result = await markRemainingAbsent({ academyId, sessionId: sheet.session.id, expectedRevision: reviewed, idempotencyKey: key });
    } catch {
      result = { ok: false, code: "unavailable", message: "Could not save. Check your connection and try again." };
    } finally {
      setBusy(false);
    }
    await queryClient.invalidateQueries({ queryKey: attendanceQueryKey(academyId, sheet.session.id) });
    if (!isCurrentAcademy(academyId)) return;
    if (!result.ok) {
      setError(result.message);
      // A definitive rejection ends this command; an uncertain one keeps it for Retry.
      if (!RETRYABLE.has(result.code)) setKey(newUuid());
      return;
    }
    if (result.outcome === "stale") { setStale(true); return; }
    toast.success(result.changed === 0
      ? "No unrecorded students were left."
      : `${result.changed} unrecorded ${result.changed === 1 ? "student" : "students"} marked absent.`);
    onClose();
  }

  function reviewLatest() {
    setReviewed(sheet.revision);
    setKey(newUuid());
    setStale(false);
    setError("");
  }

  return (
    <AlertDialog open onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Mark {unrecorded} untracked {unrecorded === 1 ? "student" : "students"} absent?</AlertDialogTitle>
          <AlertDialogDescription>Nothing is official until you finalize attendance.</AlertDialogDescription>
        </AlertDialogHeader>
        {changedSinceReview && (
          <p role="status" className="text-sm text-muted-foreground">
            Attendance changed while you were reviewing. The count above is the latest.
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
            <AlertDialogAction variant="destructive" disabled={busy || unrecorded === 0} onClick={(event) => { event.preventDefault(); void confirm(); }}>
              {busy ? "Saving…" : error ? "Retry" : "Mark absent"}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
