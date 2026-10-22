"use client";

import { taughtRootKey } from "@/modules/content";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { newUuid } from "@/lib/uuid";
import { attendanceRootKey } from "@/modules/attendance";
import { useAcademyScope } from "@/modules/auth";
import { archiveSession, restoreSession } from "../actions";
import { fetchSession, sessionQueryKey, sessionsRootKey } from "../queries";
import type { ArchiveResult, SessionDetail } from "../types";

type Props = { academyId: string; sessionId: string; mode: "archive" | "restore"; open: boolean; onClose: () => void };

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** What archiving or restoring does to this session, from the trusted session details. */
function Impact({ session, mode }: { session: SessionDetail; mode: "archive" | "restore" }) {
  const impact = session.archiveImpact;
  const official = impact ? plural(impact.officialCount, "student") : "Any";
  if (mode === "restore") {
    return (
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>The session stays ended; check-ins stay closed.</li>
        <li>{official} with finalized attendance count again, with the same values.</li>
        {impact && impact.draftCount > 0 && <li>{plural(impact.draftCount, "unfinalized change")} stay drafts until finalized.</li>}
        <li>Nothing is finalized, granted or sent again.</li>
      </ul>
    );
  }
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
      {session.state === "live" && <li>The live session ends now. Nobody is marked absent and nothing is finalized.</li>}
      <li>{official} with finalized attendance stop counting toward attendance totals. Nothing is deleted.</li>
      {impact && impact.draftCount > 0 && <li>{plural(impact.draftCount, "unfinalized change")} stay as drafts.</li>}
      <li>Attendance becomes read-only until the session is restored.</li>
      <li>
        Access already granted and messages already sent are kept.
        {impact && impact.pendingEffects > 0 && ` ${plural(impact.pendingEffects, "pending follow-up")} not yet processed will be stopped, even if the session is restored.`}
      </li>
    </ul>
  );
}

/**
 * Confirms archiving (or restoring) a session. The server decides permission and outcome; success is
 * shown only on its acknowledgment. A lost response keeps the same key so a retry cannot apply twice.
 */
export function ArchiveSessionDialog({ academyId, sessionId, mode, open, onClose }: Props) {
  const queryClient = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  // The retry key of an unanswered request, tied to the exact request it was made for.
  const retry = useRef<{ signature: string; key: string } | null>(null);
  const detail = useQuery({
    queryKey: sessionQueryKey(academyId, sessionId),
    queryFn: ({ signal }) => fetchSession(academyId, sessionId, signal),
    enabled: open,
  });
  const session = detail.data;
  const archiving = mode === "archive";
  const allowed = session ? (archiving ? session.permittedActions.archive : session.permittedActions.restore) : false;

  function close() {
    if (busy) return;
    setError(""); setNote(""); retry.current = null;
    onClose();
  }

  function report(result: Extract<ArchiveResult, { ok: true }>, title: string) {
    switch (result.outcome) {
      case "archived": toast.success(result.endedLive ? `${title} was ended and archived.` : `${title} was archived.`); break;
      case "restored": toast.success(`${title} was restored.`); break;
      case "already_archived": toast.info("This session was already archived."); break;
      case "not_archived": toast.info("This session isn’t archived."); break;
    }
  }

  async function submit() {
    if (busy || !session) return;
    const targetAcademyId = academyId;
    const trimmed = note.trim();
    const signature = `${mode}:${session.id}:${session.metadataVersion}:${archiving ? trimmed : ""}`;
    const key = retry.current?.signature === signature ? retry.current.key : newUuid();
    retry.current = { signature, key };
    setError(""); setBusy(true);
    try {
      const request = { academyId: targetAcademyId, sessionId: session.id, expectedVersion: session.metadataVersion, idempotencyKey: key };
      const result = archiving ? await archiveSession({ ...request, note: trimmed || undefined }) : await restoreSession(request);
      if (!result.ok) {
        if (result.code !== "unavailable") retry.current = null;
        if (isCurrentAcademy(targetAcademyId)) setError(result.message);
        return;
      }
      retry.current = null;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: sessionsRootKey(targetAcademyId) }),
        queryClient.invalidateQueries({ queryKey: attendanceRootKey(targetAcademyId) }),
        queryClient.invalidateQueries({ queryKey: taughtRootKey(targetAcademyId, session.id) }),
      ]);
      if (!isCurrentAcademy(targetAcademyId)) return;
      if (result.outcome === "conflict") {
        setError("This session changed since you opened it. Review the updated details and confirm again.");
        return;
      }
      report(result, session.scheduleTitle);
      setNote("");
      onClose();
    } catch {
      if (isCurrentAcademy(targetAcademyId)) setError("Could not reach the server. Try again; it won’t apply twice.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{archiving ? "Archive" : "Restore"} {session?.scheduleTitle ?? "session"}?</AlertDialogTitle>
          <AlertDialogDescription>
            {archiving
              ? "Use this for a session started by mistake or whose attendance shouldn’t count. You can restore it while the year is open."
              : "Its attendance counts again and ordinary review is available while the year is open."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {detail.isPending && <div role="status" aria-label="Loading session"><Skeleton className="h-24 rounded-lg" /></div>}
        {detail.isError && <p role="alert" className="text-sm text-destructive">Couldn’t load this session. Close and try again.</p>}
        {session && <Impact session={session} mode={mode} />}
        {session && !allowed && (
          <p role="alert" className="text-sm text-destructive">
            {!session.yearOpen ? "This academic year is closed, so this session can’t change." : archiving && session.sessionArchivedAt
              ? "This session is already archived." : !archiving && !session.sessionArchivedAt
                ? "This session isn’t archived." : "Only owners, head admins and admins can do this."}
          </p>
        )}
        {session && allowed && archiving && (
          <Field>
            <FieldLabel htmlFor="archive-note">Note (optional)</FieldLabel>
            <Textarea id="archive-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={2} disabled={busy} />
            <FieldDescription>Kept with the archive history, for example why it was archived.</FieldDescription>
          </Field>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={archiving ? "destructive" : "default"}
            onClick={(event) => { event.preventDefault(); void submit(); }}
            disabled={busy || !session || !allowed}
          >
            {busy ? (archiving ? "Archiving…" : "Restoring…") : archiving ? (session?.state === "live" ? "End and archive" : "Archive session") : "Restore session"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
