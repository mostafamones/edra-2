"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, RotateCcw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAcademyScope } from "@/modules/auth";
import type { Group, Level, Track } from "@/modules/groups";
import { DiscardDialog } from "../../components/discard-dialog";
import { StudentFormFields } from "../../components/fields";
import type { StudentRecordFailure, StudentRecordField } from "../../types";
import { studentFormSchema, type StudentFormValues, type StudentRecordInput } from "../../validation";
import { correctStudentImportRow } from "../actions";
import { cellText, FORM_FIELDS, rowFormValues } from "../corrections";
import { issueMessage, rowMessages } from "../issues";
import type { ImportRow } from "../types";

type Props = {
  academyId: string;
  academicYearId: string;
  sessionId: string;
  revision: number;
  /** The row to correct; null closes the sheet. */
  row: ImportRow | null;
  rowWord: "row" | "item";
  levels: Level[];
  tracks: Track[];
  levelNames: Record<string, string>;
  groups: Group[];
  onClose: () => void;
  /** Called after a correction saves, to refresh the preview. */
  onSaved: () => Promise<void>;
  /** Reloads the preview after another tab changed it. */
  onReload: () => void;
};

/**
 * Corrects one staged import row with the same fields as the student form. Saving changes only the
 * staged row and revalidates it; it never creates or updates a student record.
 */
export function CorrectionSheet(props: Props) {
  const [status, setStatus] = useState({ dirty: false, saving: false });
  const [confirming, setConfirming] = useState(false);

  function close() {
    setStatus({ dirty: false, saving: false });
    setConfirming(false);
    props.onClose();
  }
  function requestClose() {
    if (status.saving) return;
    if (status.dirty) setConfirming(true);
    else close();
  }

  return (
    <>
      <Sheet open={Boolean(props.row)} onOpenChange={(open) => { if (!open) requestClose(); }}>
        <SheetContent
          side="right"
          showCloseButton={!status.saving}
          onEscapeKeyDown={(event) => { if (status.saving) event.preventDefault(); }}
          onPointerDownOutside={(event) => { if (status.saving) event.preventDefault(); }}
          className="gap-0 overflow-hidden p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
        >
          {props.row && (
            <CorrectionBody key={props.row.ordinal} {...props} row={props.row}
              onStatusChange={setStatus} onCancel={requestClose} onDone={close} />
          )}
        </SheetContent>
      </Sheet>
      <DiscardDialog open={confirming} onOpenChange={setConfirming} onDiscard={close} />
    </>
  );
}

type BodyProps = Props & {
  row: ImportRow;
  onStatusChange: (status: { dirty: boolean; saving: boolean }) => void;
  onCancel: () => void;
  onDone: () => void;
};

function CorrectionBody({
  academyId, academicYearId, sessionId, revision, row, rowWord, levels, tracks, levelNames, groups,
  onSaved, onReload, onStatusChange, onCancel, onDone,
}: BodyProps) {
  const isCurrentAcademy = useAcademyScope();
  const context = useMemo(() => ({ tracks, groups }), [tracks, groups]);
  const schema = useMemo(() => studentFormSchema({ academyId, academicYearId }, context), [academyId, academicYearId, context]);
  const form = useForm<StudentFormValues, unknown, StudentRecordInput>({
    resolver: zodResolver(schema),
    defaultValues: rowFormValues(row),
  });
  const { formState: { isDirty, isSubmitting } } = form;
  const [failure, setFailure] = useState<StudentRecordFailure | null>(null);
  useEffect(() => { onStatusChange({ dirty: isDirty, saving: isSubmitting }); }, [isDirty, isSubmitting, onStatusChange]);

  // Unresolved file values beside the fields they affect, with what was wrong.
  const hints: Partial<Record<StudentRecordField, string>> = {};
  for (const issue of row.issues) {
    const field = FORM_FIELDS[issue.field];
    const original = cellText(row.source[issue.field]);
    hints[field] = [hints[field], original ? `In the file: “${original}”.` : "", issueMessage(issue)].filter(Boolean).join(" ");
  }
  if (row.status === "duplicate_existing" || row.status === "duplicate_file") {
    hints.studentPhone = [hints.studentPhone, ...rowMessages({ ...row, issues: [] }, rowWord)].filter(Boolean).join(" ");
  }

  async function save(value: StudentRecordInput) {
    const targetAcademyId = academyId;
    setFailure(null);
    try {
      const result = await correctStudentImportRow(sessionId, revision, row.ordinal, value);
      if (!isCurrentAcademy(targetAcademyId)) return;
      if (!result.ok) { setFailure(result); return; }
      await onSaved();
      if (isCurrentAcademy(targetAcademyId)) onDone();
    } catch {
      if (isCurrentAcademy(targetAcademyId)) {
        setFailure({ ok: false, code: "unavailable", message: "Could not save the correction. Check your connection and try again." });
      }
    }
  }

  return (
    <>
      <SheetHeader className="shrink-0 border-b px-6 py-5 pr-16">
        <SheetTitle className="text-xl">Correct {rowWord} {row.sourceRow}</SheetTitle>
        <SheetDescription>Changes apply only to this import’s preview. No student is saved until you confirm the import.</SheetDescription>
      </SheetHeader>
      <form onSubmit={form.handleSubmit(save)} noValidate aria-busy={isSubmitting || undefined} className="flex min-h-0 flex-1 flex-col">
        <fieldset disabled={isSubmitting} className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="flex flex-col gap-6">
            <StudentFormFields form={form} levels={levels} tracks={tracks} levelNames={levelNames} groups={groups}
              placementLocked={false} hints={hints} />
            {failure && (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertTitle>Couldn’t save the correction</AlertTitle>
                <AlertDescription className="flex flex-col items-start gap-3">
                  <span>{failure.message}</span>
                  {(failure.code === "stale_revision" || failure.code === "import_state") && (
                    <Button type="button" variant="outline" size="sm" onClick={onReload}><RotateCcw />Reload preview</Button>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </fieldset>
        <div className="grid shrink-0 grid-cols-2 gap-3 border-t bg-popover px-6 py-4">
          <Button type="button" variant="outline" className="w-full" onClick={onCancel} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? "Saving…" : "Save correction"}</Button>
        </div>
      </form>
    </>
  );
}
