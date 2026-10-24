"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircleIcon, Rotate01Icon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAcademyScope } from "@/modules/auth";
import { groupDependencyQueryKey, type Group } from "@/modules/groups";
import { previewStudentGroupChange, setStudentRecordsGroup } from "../actions";
import { studentsRootKey } from "../queries";
import type { GroupChangePreview, GroupChangeRow, RecordVersion, StudentListResult } from "../types";

export const MAX_GROUP_CHANGE = 500;
const UNASSIGNED = "__unassigned__";

type Props = {
  academyId: string;
  academicYearId: string | null;
  /** The selected records; null closes the dialog. */
  records: RecordVersion[] | null;
  /** The year's active groups. */
  groups: Group[];
  onClose: () => void;
  /** Called with every processed id after a successful change, to clear them from the selection. */
  onDone: (ids: string[]) => void;
  /** Replaces stale versions and drops records that no longer exist, after a reload. */
  onReloadSelection: (rows: GroupChangeRow[]) => void;
};

const students = (count: number) => `${count.toLocaleString("en")} ${count === 1 ? "student" : "students"}`;

/** Moves selected students to one group, or removes their group, after a fresh preview. */
export function GroupChangeDialog({ academyId, academicYearId, records, groups, onClose, onDone, onReloadSelection }: Props) {
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open={Boolean(records)} onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => { if (saving) event.preventDefault(); }}
        onPointerDownOutside={(event) => { if (saving) event.preventDefault(); }}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
      >
        {records && academicYearId && (
          <Body
            academyId={academyId}
            academicYearId={academicYearId}
            records={records}
            groups={groups}
            onClose={onClose}
            onDone={onDone}
            onReloadSelection={onReloadSelection}
            onSavingChange={setSaving}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type BodyProps = Omit<Props, "records" | "academicYearId"> & {
  academicYearId: string;
  records: RecordVersion[];
  onSavingChange: (saving: boolean) => void;
};

function Body({ academyId, academicYearId, records, groups, onClose, onDone, onReloadSelection, onSavingChange }: BodyProps) {
  const queryClient = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  // undefined until staff choose; null is the explicit Unassigned choice.
  const [destination, setDestination] = useState<string | null | undefined>(undefined);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const tooMany = records.length > MAX_GROUP_CHANGE;
  const scope = { academyId, academicYearId };

  const preview = useQuery({
    queryKey: [...studentsRootKey(academyId), "group-change", records, destination ?? "none-chosen"],
    queryFn: async () => {
      const result = await previewStudentGroupChange(scope, records, destination);
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    enabled: !tooMany,
    gcTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
  const data: GroupChangePreview | undefined = preview.data;
  const blocked = data ? Object.values(data.problems).some((count) => count > 0) : true;
  const options = data?.program
    ? groups.filter((group) => group.level_id === data.program?.levelId && (group.track_id === null || group.track_id === data.program?.trackId))
    : [];
  const destinationName = destination === null ? "Unassigned" : data?.destination?.name ?? "";

  function setSavingState(next: boolean) {
    setSaving(next);
    onSavingChange(next);
  }

  /** Optimistic: the lists show the new group and the dialog closes at once; a failure restores them. */
  async function apply() {
    if (!data || destination === undefined) return;
    const targetAcademyId = academyId;
    const ids = new Set(records.map((record) => record.id));
    const groupName = destination === null ? null : data.destination?.name ?? null;
    const listsKey = [...studentsRootKey(targetAcademyId), "list"];
    await queryClient.cancelQueries({ queryKey: listsKey });
    const snapshots = queryClient.getQueriesData<StudentListResult>({ queryKey: listsKey });
    queryClient.setQueriesData<StudentListResult>({ queryKey: listsKey }, (list) => list && {
      ...list,
      rows: list.rows.map((row) => ids.has(row.id) ? { ...row, primaryGroupId: destination, groupName } : row),
    });
    const restore = () => { for (const [key, value] of snapshots) queryClient.setQueryData(key, value); };
    setSavingState(true);
    onDone([...ids]);
    onClose();
    const settle = () => Promise.all([
      queryClient.invalidateQueries({ queryKey: studentsRootKey(targetAcademyId) }),
      queryClient.invalidateQueries({ queryKey: groupDependencyQueryKey(targetAcademyId) }),
    ]);
    try {
      const result = await setStudentRecordsGroup(scope, records, destination);
      if (!result.ok) {
        restore();
        if (isCurrentAcademy(targetAcademyId)) toast.error(`Nothing was changed. ${result.message}`);
        return;
      }
      const changed = result.data.changed.length;
      if (isCurrentAcademy(targetAcademyId)) {
        toast.success(destination === null
          ? `Removed ${students(changed)} from their groups.`
          : `Moved ${students(changed)} to ${destinationName}.`);
      }
    } catch {
      restore();
      if (isCurrentAcademy(targetAcademyId)) toast.error("Couldn’t change the group. Check your connection and try again.");
    } finally {
      setSavingState(false);
      void settle();
    }
  }

  const reloadable = data && (data.problems.stale > 0 || data.problems.missing > 0);
  return (
    <>
      <DialogHeader>
        <DialogTitle>Change group</DialogTitle>
        <DialogDescription className="sr-only">{students(records.length)} selected</DialogDescription>
      </DialogHeader>
      <div className="flex min-w-0 flex-col gap-4" aria-busy={preview.isFetching || undefined}>
        {tooMany ? (
          <Alert variant="destructive">
            <HugeiconsIcon icon={AlertCircleIcon} strokeWidth={1.5} />
            <AlertTitle>Too many students selected</AlertTitle>
            <AlertDescription>Change the group of at most {MAX_GROUP_CHANGE} students at a time. Clear some of the selection and try again.</AlertDescription>
          </Alert>
        ) : (
          <>
            <Field>
              <FieldLabel htmlFor="bulk-group-destination">Destination</FieldLabel>
              <Select
                value={destination === undefined ? "" : destination ?? UNASSIGNED}
                disabled={saving || !data}
                onValueChange={(value) => setDestination(value === UNASSIGNED ? null : value)}
              >
                <SelectTrigger id="bulk-group-destination" className="w-full"><SelectValue placeholder="Choose a group" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Unassigned (remove from group)</SelectItem>
                  {options.map((group) => <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>

            {preview.isError && (
              <Alert variant="destructive">
                <HugeiconsIcon icon={AlertCircleIcon} strokeWidth={1.5} />
                <AlertTitle>Couldn’t load the selected students</AlertTitle>
                <AlertDescription className="flex flex-wrap items-center gap-3">
                  {preview.error.message}
                  <Button variant="outline" size="sm" onClick={() => void preview.refetch()} disabled={preview.isFetching}>Retry</Button>
                </AlertDescription>
              </Alert>
            )}

            {data && blocked && (
              <Alert variant="destructive">
                <HugeiconsIcon icon={AlertCircleIcon} strokeWidth={1.5} />
                <AlertTitle>Some selected students can’t be changed</AlertTitle>
                <AlertDescription className="flex flex-col items-start gap-3">
                  <ul className="list-disc pl-4">
                    {data.problems.stale > 0 && <li>{students(data.problems.stale)} changed since you selected them.</li>}
                    {data.problems.missing > 0 && <li>{students(data.problems.missing)} no longer exist.</li>}
                    {data.problems.archived > 0 && <li>{students(data.problems.archived)} are archived. Clear them from the selection.</li>}
                    {data.problems.incompatible > 0 && <li>{students(data.problems.incompatible)} aren’t in this group’s level or track.</li>}
                  </ul>
                  {reloadable && (
                    <Button variant="outline" size="sm" onClick={() => onReloadSelection(data.rows)} disabled={saving}>
                      <HugeiconsIcon icon={Rotate01Icon} strokeWidth={1.5} />Reload selection
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </>
        )}
      </div>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {preview.isPending && !tooMany ? "Loading selected students…"
            : data && destination !== undefined && !blocked
              ? `${students(data.changed)} will change${data.unchanged > 0 ? `; ${data.unchanged.toLocaleString("en")} already ${destination === null ? "unassigned" : "in this group"}` : ""}.`
              : `${students(records.length)} selected`}
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            onClick={() => setConfirming(true)}
            disabled={saving || tooMany || !data || blocked || destination === undefined || preview.isFetching || data.changed === 0}
          >
            {destination === null ? "Remove from group" : "Change group"}
          </Button>
        </DialogFooter>
      </div>

      <AlertDialog open={confirming} onOpenChange={(open) => { if (!saving) setConfirming(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {destination === null ? `Remove ${students(data?.changed ?? 0)} from their groups?` : `Move ${students(data?.changed ?? 0)} to ${destinationName}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {data && data.unchanged > 0
                ? `${students(data.unchanged)} ${destination === null ? "already have no group" : "are already in this group"} and stay unchanged. `
                : ""}
              If any selected student changes before this saves, nothing is changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={saving} onClick={(event) => { event.preventDefault(); void apply(); }}>
              {saving ? "Saving…" : destination === null ? "Remove from group" : `Move to ${destinationName}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
