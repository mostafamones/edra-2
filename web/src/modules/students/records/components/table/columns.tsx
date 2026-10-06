"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { IconId } from "@tabler/icons-react";
import { Archive, ArchiveRestore, Eye, MoreHorizontal, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { StudentRecordRow } from "../../types";
import { formatPhone, PARTICIPATION_LABELS } from "../../validation";
import {
  ACTIONS_COLUMN, ACTIONS_WIDTH, COLUMN_LABELS, COLUMN_WIDTHS, SELECT_COLUMN, SELECT_WIDTH, type DataColumnId,
} from "../../table/config";
import { CellText } from "./cell-text";

export type ColumnOptions = {
  /** Owners and admins get the selection column and archive/restore actions. */
  canManage: boolean;
  isSelected: (id: string) => boolean;
  pageSelection: boolean | "indeterminate";
  onToggleRow: (row: StudentRecordRow, selected: boolean) => void;
  onTogglePage: (selected: boolean) => void;
  onOpen: (row: StudentRecordRow) => void;
  onArchive: (row: StudentRecordRow, archive: boolean) => void;
  /** Opens the student code dialog; omitted while student codes are off. */
  onCode?: (row: StudentRecordRow) => void;
};

const muted = (text: string, label: string) => (
  <span className="text-muted-foreground" aria-label={label}>{text}</span>
);

const data = (id: DataColumnId, cell: ColumnDef<StudentRecordRow>["cell"]): ColumnDef<StudentRecordRow> => ({
  id,
  header: COLUMN_LABELS[id],
  cell,
  ...COLUMN_WIDTHS[id],
  enableResizing: true,
  enableHiding: id !== "name",
});

export function buildColumns(options: ColumnOptions): ColumnDef<StudentRecordRow>[] {
  const columns: ColumnDef<StudentRecordRow>[] = [];
  if (options.canManage) {
    columns.push({
      id: SELECT_COLUMN,
      size: SELECT_WIDTH,
      minSize: SELECT_WIDTH,
      maxSize: SELECT_WIDTH,
      enableResizing: false,
      enableHiding: false,
      header: () => (
        <Checkbox
          checked={options.pageSelection}
          onCheckedChange={(checked) => options.onTogglePage(checked === true)}
          aria-label="Select all students on this page"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={options.isSelected(row.id)}
          onCheckedChange={(checked) => options.onToggleRow(row.original, checked === true)}
          aria-label={`Select ${row.original.fullName}`}
        />
      ),
    });
  }

  columns.push(
    data("name", ({ row }) => (
      <button
        type="button"
        onClick={() => options.onOpen(row.original)}
        className="block w-full min-w-0 rounded-sm text-left font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <CellText text={row.original.fullName}>{row.original.fullName}</CellText>
      </button>
    )),
    data("studentPhone", ({ row }) => (
      <CellText text={formatPhone(row.original.studentPhone)} dir="ltr" className="tabular-nums">{formatPhone(row.original.studentPhone)}</CellText>
    )),
    data("parentPhone", ({ row }) => (
      <CellText text={formatPhone(row.original.parentPhone)} dir="ltr" className="tabular-nums">{formatPhone(row.original.parentPhone)}</CellText>
    )),
    data("level", ({ row }) => <CellText text={row.original.levelName}>{row.original.levelName}</CellText>),
    data("track", ({ row }) => (row.original.trackName
      ? <CellText text={row.original.trackName}>{row.original.trackName}</CellText>
      : muted("—", "No track"))),
    data("group", ({ row }) => (row.original.groupName
      ? <CellText text={row.original.groupName}>{row.original.groupName}</CellText>
      : muted("Unassigned", "Unassigned"))),
    data("participationType", ({ row }) => (
      <CellText text={PARTICIPATION_LABELS[row.original.participationType]}>{PARTICIPATION_LABELS[row.original.participationType]}</CellText>
    )),
    data("status", ({ row }) => (row.original.archivedAt
      ? <Badge variant="secondary">Archived</Badge>
      : <Badge variant="outline" className="border-primary/30 text-primary">Active</Badge>)),
    data("createdAt", ({ row }) => {
      const created = format(new Date(row.original.createdAt), "MMM d, yyyy");
      return <CellText text={created} className="tabular-nums">{created}</CellText>;
    }),
  );

  columns.push({
    id: ACTIONS_COLUMN,
    size: ACTIONS_WIDTH,
    minSize: ACTIONS_WIDTH,
    maxSize: ACTIONS_WIDTH,
    enableResizing: false,
    enableHiding: false,
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => {
      const archived = Boolean(row.original.archivedAt);
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={`Actions for ${row.original.fullName}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onSelect={() => options.onOpen(row.original)}>
              {archived ? <><Eye />View</> : <><Pencil />Edit</>}
            </DropdownMenuItem>
            {options.onCode && !archived && (
              <DropdownMenuItem onSelect={() => options.onCode?.(row.original)}><IconId />Student code</DropdownMenuItem>
            )}
            {options.canManage && (
              <>
                <DropdownMenuSeparator />
                {archived ? (
                  <DropdownMenuItem onSelect={() => options.onArchive(row.original, false)}><ArchiveRestore />Restore</DropdownMenuItem>
                ) : (
                  <DropdownMenuItem variant="destructive" onSelect={() => options.onArchive(row.original, true)}><Archive />Archive</DropdownMenuItem>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  });
  return columns;
}
