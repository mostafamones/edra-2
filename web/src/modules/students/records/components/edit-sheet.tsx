"use client";

import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { IconAlertCircle, IconId, IconRestore } from "@tabler/icons-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAcademyScope } from "@/modules/auth";
import type { AcademyEntry } from "@/modules/academies";
import { groupDependencyQueryKey } from "@/modules/groups";
import { setStudentRecordsArchived } from "../actions";
import { canArchiveStudentRecords } from "../permissions";
import { fetchStudentRecord, StudentRequestError, studentRecordQueryKey, studentsRootKey } from "../queries";
import type { StudentRecord } from "../types";
import { StudentCodeDialog } from "../../codes/components/dialog";
import { useStudentCodeSettings } from "../../codes/use-settings";
import { DiscardDialog } from "./discard-dialog";
import { FormSkeleton, StudentRecordForm, type FormStatus } from "./form";

type Props = {
  academy: AcademyEntry;
  /** The record to open; null closes the sheet. */
  recordId: string | null;
  onClose: () => void;
};

/** Side sheet that edits one student. Saving blocks dismissal; unsaved edits ask first. Archived records open read-only. */
export function StudentEditSheet({ academy, recordId, onClose }: Props) {
  const [status, setStatus] = useState<FormStatus>({ dirty: false, saving: false });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const onStatusChange = useCallback((next: FormStatus) => setStatus(next), []);

  function close() {
    setStatus({ dirty: false, saving: false });
    setConfirming(false);
    onClose();
  }

  function requestClose() {
    if (status.saving || busy) return;
    if (status.dirty) setConfirming(true);
    else close();
  }

  const blocked = status.saving || busy;
  return (
    <>
      <Sheet open={Boolean(recordId)} onOpenChange={(open) => { if (!open) requestClose(); }}>
        <SheetContent
          side="right"
          showCloseButton={!blocked}
          onEscapeKeyDown={(event) => { if (blocked) event.preventDefault(); }}
          onPointerDownOutside={(event) => { if (blocked) event.preventDefault(); }}
          className="gap-0 overflow-hidden p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
        >
          {recordId && (
            <SheetBody
              key={recordId}
              academy={academy}
              recordId={recordId}
              onSaved={close}
              onCancel={requestClose}
              onStatusChange={onStatusChange}
              onBusyChange={setBusy}
            />
          )}
        </SheetContent>
      </Sheet>
      <DiscardDialog open={confirming} onOpenChange={setConfirming} onDiscard={close} />
    </>
  );
}

type BodyProps = {
  academy: AcademyEntry;
  recordId: string;
  onSaved: () => void;
  onCancel: () => void;
  onStatusChange: (status: FormStatus) => void;
  onBusyChange: (busy: boolean) => void;
};

/** Fetches the record fresh each time the sheet opens, before editing is enabled. */
function SheetBody({ academy, recordId, onSaved, onCancel, onStatusChange, onBusyChange }: BodyProps) {
  const queryClient = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  const [restoring, setRestoring] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const codesEnabled = useStudentCodeSettings(academy.id).data?.enabled ?? false;
  const query = useQuery({
    queryKey: studentRecordQueryKey(academy.id, recordId),
    queryFn: ({ signal }) => fetchStudentRecord(academy.id, recordId, signal),
    // A refetch would replace the record under an open draft; reloads happen only on request.
    staleTime: Infinity,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    gcTime: 0,
    retry: (count, error) => !(error instanceof StudentRequestError && error.status === 404) && count < 2,
  });
  const record = query.data;

  async function restore(target: StudentRecord) {
    const targetAcademyId = academy.id;
    setRestoring(true); onBusyChange(true);
    try {
      const result = await setStudentRecordsArchived(targetAcademyId, target.academicYearId, [{ id: target.id, version: target.version }], false);
      if (!result.ok) { if (isCurrentAcademy(targetAcademyId)) toast.error(result.message); return; }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: studentsRootKey(targetAcademyId) }),
        queryClient.invalidateQueries({ queryKey: groupDependencyQueryKey(targetAcademyId) }),
      ]);
      if (isCurrentAcademy(targetAcademyId)) toast.success(`${target.fullName} is active again.`);
    } catch {
      if (isCurrentAcademy(targetAcademyId)) toast.error("Could not restore the student.");
    } finally {
      setRestoring(false); onBusyChange(false);
    }
  }

  const archived = Boolean(record?.archivedAt);
  return (
    <>
      <SheetHeader className="shrink-0 border-b px-6 py-5 pr-16">
        <SheetTitle className="flex items-center gap-2 text-xl font-normal">
          {archived ? "Archived student: " : "Edit student: "}
          <span className="font-[Noto_Sans_Arabic] font-semibold">{record?.fullName ?? "Loading..."}</span>
        </SheetTitle>
        {record && !archived && codesEnabled && (
          <Button type="button" variant="outline" size="sm" className="mt-2 w-fit" onClick={() => setCodeOpen(true)}>
            <IconId data-icon="inline-start" />Student code
          </Button>
        )}
      </SheetHeader>
      {record && (
        <StudentCodeDialog
          academy={academy}
          target={codeOpen ? { id: record.id, fullName: record.fullName, levelId: record.levelId } : null}
          onClose={() => setCodeOpen(false)}
        />
      )}
      <div className="flex min-h-0 flex-1 flex-col">
        {query.isError ? (
          <div className="px-6 py-5">
            <Alert variant="destructive">
              <IconAlertCircle />
              <AlertTitle>{query.error instanceof StudentRequestError && query.error.status === 404 ? "Student not found" : "Couldn’t load the student"}</AlertTitle>
              <AlertDescription className="flex flex-col items-start gap-3">
                {query.error instanceof StudentRequestError && query.error.status === 404
                  ? "This student record no longer exists in this academy."
                  : "Check your connection and try again."}
                <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>
                  {query.isFetching ? "Retrying…" : "Try again"}
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        ) : !record || (query.isFetching && !query.isRefetching) ? (
          <FormSkeleton className="px-6 py-5" />
        ) : (
          <StudentRecordForm
            // A reload brings a new version, which re-mounts the form with the latest values.
            key={`${record.id}:${record.version}:${record.archivedAt ?? ""}`}
            academy={academy}
            record={record}
            variant="sheet"
            readOnly={archived}
            readOnlyActions={
              <>
                <Button type="button" variant="outline" onClick={onCancel} disabled={restoring}>Close</Button>
                {canArchiveStudentRecords(academy.role) && (
                  <Button type="button" onClick={() => void restore(record)} disabled={restoring}>
                    <IconRestore />{restoring ? "Restoring…" : "Restore student"}
                  </Button>
                )}
              </>
            }
            onSaved={onSaved}
            onCancel={onCancel}
            onReload={() => void query.refetch()}
            onStatusChange={onStatusChange}
          />
        )}
      </div>
    </>
  );
}
