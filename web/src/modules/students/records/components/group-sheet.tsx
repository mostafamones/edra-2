"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { IconAlertCircle, IconArrowRight, IconRotate } from "@tabler/icons-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAcademyScope } from "@/modules/auth";
import { groupDependencyQueryKey, type Group } from "@/modules/groups";
import { previewStudentGroupChange, setStudentRecordsGroup } from "../actions";
import type { PageSize } from "../list-params";
import { studentsRootKey } from "../queries";
import type { GroupChangePreview, GroupChangeProblem, GroupChangeRow, RecordVersion, StudentListResult } from "../types";
import { CellText } from "./table/cell-text";
import { StudentsPagination } from "./table/pagination";

export const MAX_GROUP_CHANGE = 500;
const UNASSIGNED = "__unassigned__";

type Props = {
  academyId: string;
  academicYearId: string | null;
  /** The selected records; null closes the sheet. */
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

const PROBLEMS: Record<GroupChangeProblem, string> = {
  missing: "No longer exists",
  stale: "Changed since selected",
  archived: "Archived",
  incompatible: "Different level or track",
};

/** Moves selected students to one group, or removes their group, after a fresh preview. */
export function GroupChangeSheet({ academyId, academicYearId, records, groups, onClose, onDone, onReloadSelection }: Props) {
  const [saving, setSaving] = useState(false);
  return (
    <Sheet open={Boolean(records)} onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <SheetContent
        side="right"
        showCloseButton={!saving}
        onEscapeKeyDown={(event) => { if (saving) event.preventDefault(); }}
        onPointerDownOutside={(event) => { if (saving) event.preventDefault(); }}
        className="gap-0 overflow-hidden p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl"
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
      </SheetContent>
    </Sheet>
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
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(20);
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
  const pageRows = data?.rows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize) ?? [];

  function setSavingState(next: boolean) {
    setSaving(next);
    onSavingChange(next);
  }

  /** Optimistic: the lists show the new group and the sheet closes at once; a failure restores them. */
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
      <SheetHeader className="shrink-0 border-b px-6 py-5 pr-16">
        <SheetTitle className="text-xl">Change group</SheetTitle>
        <SheetDescription>{students(records.length)} selected. Only the group changes; level, track, type, names, and phones stay the same.</SheetDescription>
      </SheetHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
        {tooMany ? (
          <Alert variant="destructive">
            <IconAlertCircle />
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
                onValueChange={(value) => { setDestination(value === UNASSIGNED ? null : value); setPageIndex(0); }}
              >
                <SelectTrigger id="bulk-group-destination" className="w-full"><SelectValue placeholder="Choose a group" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Unassigned (remove from group)</SelectItem>
                  {options.map((group) => <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <FieldDescription>
                {data && !data.program
                  ? "The selected students are in different levels, so they can only be removed from their groups. Select students from one level to move them into a group."
                  : "Level-wide groups, and groups for the selected students’ track, in their level. Group capacity isn’t checked here."}
              </FieldDescription>
            </Field>

            {preview.isError && (
              <Alert variant="destructive">
                <IconAlertCircle />
                <AlertTitle>Couldn’t load the selected students</AlertTitle>
                <AlertDescription className="flex flex-wrap items-center gap-3">
                  {preview.error.message}
                  <Button variant="outline" size="sm" onClick={() => void preview.refetch()} disabled={preview.isFetching}>Retry</Button>
                </AlertDescription>
              </Alert>
            )}

            {data && blocked && (
              <Alert variant="destructive">
                <IconAlertCircle />
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
                      <IconRotate />Reload selection
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <div className="min-w-0 overflow-hidden rounded-lg border">
              <Table className="table-fixed" aria-busy={preview.isFetching || undefined}>
                <TableHeader className="bg-muted/40">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[34%] pl-4 text-left">Student</TableHead>
                    <TableHead className="pl-4">Current → proposed</TableHead>
                    <TableHead className="w-36 pl-4">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!data ? Array.from({ length: 6 }, (_, index) => (
                    <TableRow key={index} className="hover:bg-transparent">
                      {[0, 1, 2].map((cell) => <TableCell key={cell} className="h-11 pl-4"><Skeleton className="h-4 w-3/4" /></TableCell>)}
                    </TableRow>
                  )) : pageRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="h-11 min-w-0 pl-4 text-left font-medium">
                        <CellText text={row.fullName ?? "Unknown student"}>{row.fullName ?? "Unknown student"}</CellText>
                      </TableCell>
                      <TableCell className="min-w-0 pl-4">
                        {row.levelName ? (
                          <span className="flex min-w-0 items-center gap-1.5 text-sm">
                            <CellText text={placement(row)} className="text-muted-foreground">{placement(row)}</CellText>
                            {destination !== undefined && (
                              <>
                                <IconArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-label="to" />
                                <span className="shrink-0">{destinationName}</span>
                              </>
                            )}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="pl-4">
                        {row.problem ? <Badge variant="destructive">{PROBLEMS[row.problem]}</Badge>
                          : destination === undefined ? <span className="text-muted-foreground">—</span>
                            : row.changes ? <Badge variant="outline" className="border-primary/30 text-primary">Changes</Badge>
                              : <Badge variant="secondary">No change</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {data && data.rows.length > pageSize && (
              <StudentsPagination pageIndex={pageIndex} pageSize={pageSize} total={data.rows.length}
                onPageChange={setPageIndex} onPageSizeChange={(size) => { setPageSize(size); setPageIndex(0); }} />
            )}
          </>
        )}
      </div>
      <div className="flex shrink-0 flex-col gap-3 border-t bg-popover px-6 py-4 sm:flex-row sm:items-center">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {data && destination !== undefined && !blocked && `${students(data.changed)} will change${data.unchanged > 0 ? `; ${data.unchanged.toLocaleString("en")} already ${destination === null ? "unassigned" : "in this group"}` : ""}.`}
        </p>
        <div className="flex gap-2 sm:ml-auto">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            onClick={() => setConfirming(true)}
            disabled={saving || tooMany || !data || blocked || destination === undefined || preview.isFetching || data.changed === 0}
          >
            {destination === null ? "Remove from group" : "Change group"}
          </Button>
        </div>
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

const placement = (row: GroupChangeRow) =>
  [row.levelName, row.trackName, row.currentGroupName ?? "Unassigned"].filter(Boolean).join(" · ");
