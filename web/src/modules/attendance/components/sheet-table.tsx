"use client";

import { IconFilterOff, IconUsers } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AttendanceStatus, SheetEntry } from "../types";
import { cn } from "@/lib/utils";
import { formatClock, STATUS_DOTS, STATUS_LABELS } from "./labels";
import { StatusInput } from "./status-input";
import type { PendingEdits } from "./use-edits";

type Props = {
  /** Every roster entry, before search and filters. */
  total: number;
  rows: SheetEntry[];
  editable: boolean;
  pending: PendingEdits;
  selected: Set<string>;
  onSelect: (ids: string[], checked: boolean) => void;
  onStatus: (entry: SheetEntry, status: AttendanceStatus) => void;
  onClearFilters: () => void;
};

/** The roster with each student's draft input and official value. Empty states replace the table. */
export function SheetTable({ total, rows, editable, pending, selected, onSelect, onStatus, onClearFilters }: Props) {
  if (total === 0) {
    return (
      <Empty className="min-h-48 py-14">
        <EmptyHeader className="gap-1">
          <EmptyMedia variant="icon"><IconUsers aria-hidden="true" /></EmptyMedia>
          <EmptyTitle>No students on this roster</EmptyTitle>
          <EmptyDescription>No active in-person students matched this class when the session started.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  if (rows.length === 0) {
    return (
      <Empty className="min-h-48 py-14">
        <EmptyHeader className="gap-1">
          <EmptyMedia variant="icon"><IconFilterOff aria-hidden="true" /></EmptyMedia>
          <EmptyTitle>No matching students</EmptyTitle>
          <EmptyDescription>Try a different search or status, or clear the filters to see the whole roster.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent><Button size="sm" variant="outline" onClick={onClearFilters}>Clear filters</Button></EmptyContent>
      </Empty>
    );
  }

  const ids = rows.map((row) => row.annualStudentRecordId);
  const selectedHere = ids.filter((id) => selected.has(id)).length;
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader className="bg-muted/30">
          <TableRow>
            {editable && (
              <TableHead className="w-10 pl-4">
                <Checkbox
                  aria-label="Select all shown students"
                  checked={selectedHere === 0 ? false : selectedHere === ids.length ? true : "indeterminate"}
                  onCheckedChange={(checked) => onSelect(ids, checked === true)}
                />
              </TableHead>
            )}
            <TableHead className={editable ? undefined : "pl-4"}>Student</TableHead>
            <TableHead>Attendance</TableHead>
            <TableHead className="w-90 pr-4">Finalized</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((entry) => (
            <TableRow key={entry.annualStudentRecordId} data-state={selected.has(entry.annualStudentRecordId) ? "selected" : undefined}>
              {editable && (
                <TableCell className="pl-4">
                  <Checkbox
                    aria-label={`Select ${entry.fullName}`}
                    checked={selected.has(entry.annualStudentRecordId)}
                    onCheckedChange={(checked) => onSelect([entry.annualStudentRecordId], checked === true)}
                  />
                </TableCell>
              )}
              <TableCell className={editable ? undefined : "pl-4"}>
                <div className="flex min-h-10 flex-col justify-center gap-0.5">
                  <span className="flex flex-wrap items-center gap-1.5 font-medium">
                    {entry.fullName}
                    {entry.archived && <Badge variant="outline" className="text-[11px] text-muted-foreground">Archived</Badge>}
                  </span>
                  {entry.updatedAt && (
                    <span className="text-xs text-muted-foreground">
                      {entry.source === "check_in" ? "Checked in" : "Set"} by {entry.updatedByName ?? "staff"} · {formatClock(entry.updatedAt)}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                {editable ? (
                  <StatusInput
                    studentName={entry.fullName}
                    value={entry.status}
                    pending={pending[entry.annualStudentRecordId]}
                    disabled={false}
                    onChange={(status) => onStatus(entry, status)}
                  />
                ) : (
                  <Badge variant={entry.status === "absent" ? "destructive" : "secondary"}>{STATUS_LABELS[entry.status]}</Badge>
                )}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-1.5">
                  {entry.publishedStatus
                    ? <Badge variant="outline" className="gap-1.5"><span className={cn("size-1.5 rounded-full", STATUS_DOTS[entry.publishedStatus])} aria-hidden="true" />{STATUS_LABELS[entry.publishedStatus]}</Badge>
                    : <span className="text-muted-foreground" aria-label="Not finalized">—</span>}
                  {entry.correctionPending && <Badge variant="secondary">Correction pending</Badge>}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
