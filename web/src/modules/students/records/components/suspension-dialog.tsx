import { useState } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAcademyScope } from "@/modules/auth";
import { studentsRootKey } from "../queries";
import { previewStudentSuspension, setStudentSuspension } from "../suspension";
import type { SuspensionOutcome, SuspensionPreviewRow } from "../types";
import { MAX_SUSPENSION_REASON } from "../validation";

export type SuspensionRequest = {
  /** True suspends online access; false restores it. */
  suspend: boolean;
  recordIds: string[];
  /** The student's name for one record; omitted for a selection. */
  name?: string;
};

type Props = {
  academyId: string;
  request: SuspensionRequest | null;
  onClose: () => void;
  /** Called once the server acknowledged the change. */
  onDone?: (request: SuspensionRequest, outcome: SuspensionOutcome) => void;
};

const students = (count: number) => `${count} ${count === 1 ? "student" : "students"}`;

/** The fresh selection read for confirmation; outside the students root so list refreshes never refetch it. */
export const suspensionPreviewKey = (academyId: string, recordIds: string[]) => ["student-suspension-preview", academyId, recordIds] as const;

/**
 * Refreshes everything that shows a profile's online access: student lists and details across its
 * annual records, and the learning and content-access projections. Resolves false when a student
 * read on screen failed, so the caller can offer another refresh without repeating the change.
 */
export async function refreshSuspensionViews(queryClient: QueryClient, academyId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: studentsRootKey(academyId) }),
    queryClient.invalidateQueries({ queryKey: ["learning"] }),
    queryClient.invalidateQueries({ queryKey: ["content-access"] }),
  ]);
  return !queryClient.getQueryCache().findAll({ queryKey: studentsRootKey(academyId), type: "active" })
    .some((query) => query.state.status === "error");
}

/** Shared confirmation for suspending or restoring online access, for one record or a selection. */
export function SuspensionDialog({ academyId, request, onClose, onDone }: Props) {
  return (
    <AlertDialog open={Boolean(request)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <AlertDialogContent>
        {/* A new request starts with a fresh preview and an empty reason. */}
        {request && <Body key={`${request.suspend}:${request.recordIds.join(",")}`} academyId={academyId} request={request} onClose={onClose} onDone={onDone} />}
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Body({ academyId, request, onClose, onDone }: Props & { request: SuspensionRequest }) {
  const queryClient = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const preview = useQuery({
    queryKey: suspensionPreviewKey(academyId, request.recordIds),
    queryFn: async () => {
      const result = await previewStudentSuspension({ academyId, recordIds: request.recordIds });
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const rows = preview.data;
  const missing = rows ? request.recordIds.length - rows.length : 0;
  const changing = rows?.filter((row) => row.suspended !== request.suspend) ?? [];
  const unchanged = rows ? rows.length - changing.length : 0;
  // Restoring manual suspension leaves archival suspension in place.
  const stillArchived = request.suspend ? 0 : changing.filter((row) => row.archived).length;
  const subject = request.name ?? students(request.recordIds.length);
  const verb = request.suspend ? "Suspend" : "Restore";
  const tooLong = reason.trim().length > MAX_SUSPENSION_REASON;
  const ready = Boolean(rows) && !preview.isFetching && missing === 0 && !tooLong;

  async function confirm(reviewed: SuspensionPreviewRow[]) {
    const targetAcademyId = academyId;
    setBusy(true); setError("");
    try {
      const result = await setStudentSuspension({
        academyId: targetAcademyId,
        records: reviewed.map((row) => ({ id: row.recordId, revision: row.revision })),
        suspended: request.suspend,
        reason,
      });
      if (!isCurrentAcademy(targetAcademyId)) return;
      if (!result.ok) {
        setError(result.message);
        // Keep the reason; show the refreshed state and wait for a renewed confirmation.
        if (result.code === "stale_suspension" || result.code === "not_found") void preview.refetch();
        return;
      }
      const { changed, unchanged: same } = result.data;
      const done = request.suspend ? "Suspended" : "Restored";
      const message = changed.length === 0
        ? `No change: ${request.name ?? students(same.length)} already ${request.suspend ? "suspended" : "not suspended"}.`
        : `${done} online access for ${request.name ?? students(changed.length)}${same.length ? `; ${same.length} unchanged` : ""}.`;
      onDone?.(request, result.data);
      onClose();
      const refreshed = await refreshSuspensionViews(queryClient, targetAcademyId);
      if (!isCurrentAcademy(targetAcademyId)) return;
      if (refreshed) toast.success(message);
      else toast.warning(`${message} Couldn’t refresh students.`, {
        action: { label: "Refresh", onClick: () => void refreshSuspensionViews(queryClient, targetAcademyId) },
      });
    } catch {
      if (isCurrentAcademy(targetAcademyId)) setError(`Could not ${verb.toLowerCase()} online access. Check your connection and try again.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{verb} online access for {subject}?</AlertDialogTitle>
        <AlertDialogDescription asChild>
          <div className="space-y-1">
            {!rows && !preview.isError && <Skeleton className="h-4 w-48" />}
            {preview.isError && <span className="block">Couldn’t load the selected students.</span>}
            {rows && missing > 0 && <span className="block text-destructive">{students(missing)} no longer exist. Close and reselect.</span>}
            {rows && missing === 0 && (
              <>
                <span className="block">{changing.length} will change{unchanged ? ` · ${unchanged} already ${request.suspend ? "suspended" : "not suspended"}` : ""}</span>
                {stillArchived > 0 && <span className="block">{stillArchived} archived: online access stays suspended until restored</span>}
              </>
            )}
          </div>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <Field data-invalid={tooLong || undefined}>
        <FieldLabel htmlFor="suspension-reason">Reason (optional)</FieldLabel>
        <Textarea id="suspension-reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={3}
          maxLength={MAX_SUSPENSION_REASON} disabled={busy} aria-invalid={tooLong || undefined} />
      </Field>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
        {preview.isError ? (
          <AlertDialogAction variant="outline" onClick={(event) => { event.preventDefault(); void preview.refetch(); }}>Retry</AlertDialogAction>
        ) : (
          <AlertDialogAction
            variant={request.suspend ? "destructive" : "default"}
            disabled={busy || !ready}
            onClick={(event) => { event.preventDefault(); if (rows) void confirm(rows); }}
          >
            {busy ? `${request.suspend ? "Suspending" : "Restoring"}…` : `${verb} online access`}
          </AlertDialogAction>
        )}
      </AlertDialogFooter>
    </>
  );
}
