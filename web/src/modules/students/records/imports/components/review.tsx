"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { IconAlertCircle, IconRotate } from "@tabler/icons-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useAcademyScope, useAuth } from "@/modules/auth";
import type { StudentRecordFailure } from "../../types";
import type { StudentRecordInput } from "../../validation";
import { cancelStudentImport, confirmStudentImport, correctStudentImportRow, removeStudentImportEntries } from "../actions";
import { importSessionKey } from "../queries";
import type { Group, Level, Track } from "@/modules/groups";
import type { ImportRow, ImportSummary } from "../types";
import { CorrectionSheet } from "./correction-sheet";
import { ImportRowsSection } from "./rows-section";

type Props = {
  academyId: string;
  summary: ImportSummary;
  levels: Level[];
  tracks: Track[];
  levelNames: Record<string, string>;
  groups: Group[];
  onConfirmed: () => void;
  onDiscarded: () => void;
};

const students = (count: number) => `${count.toLocaleString("en")} new ${count === 1 ? "student" : "students"}`;

/** The validated preview: statuses, corrections, exclusions, and confirmation. */
export function ReviewStep({ academyId, summary, levels, tracks, levelNames, groups, onConfirmed, onDiscarded }: Props) {
  const queryClient = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  const { user } = useAuth();
  const editable = user?.id === summary.createdBy;
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<ImportRow | null>(null);
  const [failure, setFailure] = useState<StudentRecordFailure | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const { counts } = summary;
  const rowWord = summary.format === "json" ? "item" : "row";
  const duplicates = counts.duplicate_existing + counts.duplicate_file;

  const refresh = () => queryClient.invalidateQueries({ queryKey: importSessionKey(academyId, summary.id) });

  async function remove(ordinals: number[]): Promise<boolean> {
    const targetAcademyId = academyId;
    setFailure(null);
    const result = await removeStudentImportEntries(summary.id, summary.revision, ordinals);
    if (!isCurrentAcademy(targetAcademyId)) return false;
    if (!result.ok) { setFailure(result); await refresh(); return false; }
    await refresh();
    return true;
  }

  /** Saves inline corrections one at a time, each against the revision the previous one produced. */
  async function correct(changes: { ordinal: number; input: StudentRecordInput }[]): Promise<number[]> {
    const targetAcademyId = academyId;
    setFailure(null);
    const saved: number[] = [];
    let revision = summary.revision;
    try {
      for (const change of changes) {
        const result = await correctStudentImportRow(summary.id, revision, change.ordinal, change.input);
        if (!isCurrentAcademy(targetAcademyId)) return saved;
        if (!result.ok) { setFailure(result); break; }
        revision = result.data.revision;
        saved.push(change.ordinal);
      }
    } catch {
      if (isCurrentAcademy(targetAcademyId)) setFailure({ ok: false, code: "unavailable", message: "Couldn’t save every correction. Check your connection and try again." });
    }
    if (isCurrentAcademy(targetAcademyId)) await refresh();
    return saved;
  }

  async function confirm() {
    const targetAcademyId = academyId;
    setBusy(true);
    setFailure(null);
    try {
      const result = await confirmStudentImport(summary.id, summary.revision);
      if (!isCurrentAcademy(targetAcademyId)) return;
      setConfirming(false);
      if (!result.ok) {
        setFailure(result);
        await refresh();
        return;
      }
      await refresh();
      onConfirmed();
    } catch {
      if (isCurrentAcademy(targetAcademyId)) {
        setConfirming(false);
        setFailure({ ok: false, code: "unavailable", message: "Couldn’t confirm the import. Check your connection and try again." });
      }
    } finally {
      setBusy(false);
    }
  }

  async function discard() {
    const targetAcademyId = academyId;
    setBusy(true);
    try {
      const result = await cancelStudentImport(summary.id);
      if (!isCurrentAcademy(targetAcademyId)) return;
      if (!result.ok) { setFailure(result); return; }
      onDiscarded();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {failure && (
        <Alert variant={failure.code === "outcome_changed" ? "default" : "destructive"}>
          <IconAlertCircle />
          <AlertTitle>{failure.code === "outcome_changed" ? "The preview changed" : "Couldn’t update the import"}</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3">
            <span>{failure.message}</span>
            {(failure.code === "stale_revision" || failure.code === "import_state") && (
              <Button variant="outline" size="sm" disabled={correcting} onClick={() => { setFailure(null); void refresh(); }}><IconRotate />Reload preview</Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      <ImportRowsSection
        academyId={academyId}
        sessionId={summary.id}
        mode="review"
        rowWord={rowWord}
        onRemove={editable ? remove : undefined}
        onEdit={editable ? setEditing : undefined}
        invalidCount={editable ? counts.invalid : undefined}
        correction={editable ? { academicYearId: summary.academicYearId, levels, tracks, levelNames, groups, onSave: correct, onCorrectingChange: setCorrecting } : undefined}
        disabled={busy}
      />

      {editable && <div className="sticky bottom-0 z-10 flex py-4 flex-col gap-3 bg-background backdrop-blur sm:-mx-6 sm:flex-row sm:items-center sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex gap-2 sm:ml-auto">
          <Button variant="destructive" onClick={() => void discard()} disabled={busy || correcting}>Discard import</Button>
          <Button onClick={() => setConfirming(true)} disabled={busy || correcting || counts.ready === 0} title={correcting ? "Turn off correction mode first" : undefined}>
            Import {students(counts.ready)}
          </Button>
        </div>
      </div>}

      <CorrectionSheet
        academyId={academyId}
        academicYearId={summary.academicYearId}
        sessionId={summary.id}
        revision={summary.revision}
        row={editing}
        rowWord={rowWord}
        levels={levels}
        tracks={tracks}
        levelNames={levelNames}
        groups={groups}
        onClose={() => setEditing(null)}
        onSaved={refresh}
        onReload={() => { setEditing(null); void refresh(); }}
      />

      <AlertDialog open={confirming} onOpenChange={(open) => { if (!busy) setConfirming(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Import {students(counts.ready)}?</AlertDialogTitle>
            <AlertDialogDescription>
              Rows are created in batches of 100 and saved as each batch finishes. After you confirm, the reviewed entries are fixed.
              {(counts.invalid + duplicates + counts.excluded) > 0 && ` ${(counts.invalid + duplicates + counts.excluded).toLocaleString("en")} other rows will be skipped.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep reviewing</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); void confirm(); }}>
              {busy ? "Checking…" : `Import ${students(counts.ready)}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
