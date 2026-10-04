"use client";

import { IconPencil } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Group, Level, Track } from "@/modules/groups";
import { CellText } from "../../components/table/cell-text";
import { formatPhone, isParticipationType, PARTICIPATION_LABELS, type StudentFormValues } from "../../validation";
import { editableFields, FORM_FIELDS, rowFormValues, type FieldErrors } from "../corrections";
import { OUTCOME_LABELS, rowMessages, STATUS_LABELS } from "../issues";
import type { CellValue, ImportField, ImportRow } from "../types";
import { ImportCellEditor } from "./cell-editor";

/** Correction mode: invalid fields become inputs bound to unsaved drafts. */
export type ImportCorrection = {
  drafts: ReadonlyMap<number, StudentFormValues>;
  /** Fields the user chose a value for, including one equal to the staged value. */
  touched: ReadonlyMap<number, ReadonlySet<keyof StudentFormValues>>;
  errors: ReadonlyMap<number, FieldErrors>;
  onChange: (row: ImportRow, change: Partial<StudentFormValues>) => void;
  levels: Level[];
  tracks: Track[];
  levelNames: Record<string, string>;
  groups: Group[];
};

type Props = {
  rows: ImportRow[];
  loading: boolean;
  fetching: boolean;
  /** Preview shows source values; review and results add validation status or execution outcomes. */
  mode: "preview" | "review" | "results";
  rowWord: "row" | "item";
  selected?: ReadonlySet<number>;
  onSelectionChange?: (selected: Set<number>) => void;
  /** Opens the in-app correction for a row (review only). */
  onEdit?: (row: ImportRow) => void;
  correction?: ImportCorrection;
  disabled?: boolean;
};

const raw = (cell: CellValue | undefined) => (typeof cell === "string" ? cell : cell === null ? "" : cell ? `(${cell.problem})` : "");

const BADGE: Record<string, { variant: "outline" | "secondary" | "destructive"; className?: string }> = {
  ready: { variant: "outline", className: "border-primary/30 text-primary" },
  created: { variant: "outline", className: "border-primary/30 text-primary" },
  invalid: { variant: "destructive" },
  failed: { variant: "destructive" },
  duplicate_existing: { variant: "secondary" },
  duplicate_file: { variant: "secondary" },
  excluded: { variant: "secondary" },
  skipped: { variant: "secondary" },
  pending: { variant: "outline" },
};

const UNASSIGNED = "Unassigned";

type Column = { field: ImportField; header: string; width: string; editWidth: string; ltr?: boolean; bold?: boolean; text: (row: ImportRow, mode: Props["mode"]) => string };

const COLUMNS: Column[] = [
  { field: "full_name", header: "Name", width: "12rem", editWidth: "14rem", bold: true, text: (row) => row.input?.full_name ?? raw(row.source.full_name) },
  { field: "student_phone", header: "Student phone", width: "9rem", editWidth: "12rem", ltr: true, text: (row) => row.input?.student_phone ? formatPhone(row.input.student_phone) : raw(row.source.student_phone) },
  { field: "parent_phone", header: "Parent phone", width: "9rem", editWidth: "12rem", ltr: true, text: (row) => row.input?.parent_phone ? formatPhone(row.input.parent_phone) : raw(row.source.parent_phone) },
  { field: "level", header: "Level", width: "7rem", editWidth: "12rem", text: (row) => row.levelName ?? raw(row.source.level) },
  { field: "track", header: "Track", width: "7rem", editWidth: "11rem", text: (row) => row.trackName ?? raw(row.source.track) },
  {
    field: "group", header: "Group", width: "8rem", editWidth: "11rem",
    text: (row, mode) => mode === "preview" ? raw(row.source.group) : row.groupName ?? (row.issues.some((issue) => issue.field === "group") ? raw(row.source.group) : UNASSIGNED),
  },
  {
    field: "student_type", header: "Type", width: "7rem", editWidth: "10rem",
    text: (row) => {
      const rawType = raw(row.source.student_type);
      return row.input?.participation_type ? PARTICIPATION_LABELS[row.input.participation_type] : isParticipationType(rawType) ? PARTICIPATION_LABELS[rawType] : rawType;
    },
  },
];

/**
 * Staged import rows: resolved values, status, and what to fix. Not saved student records.
 * A column with nothing to show on this page is left out unless a row has a problem in it.
 */
export function ImportRowsTable({ rows, loading, fetching, mode, rowWord, selected, onSelectionChange, onEdit, correction, disabled }: Props) {
  const selectable = Boolean(onSelectionChange);
  // In correction mode, each correctable row's current values and the fields edited in place.
  const editing = new Map<number, { values: StudentFormValues; initial: StudentFormValues; fields: Set<ImportField> }>();
  if (correction) {
    for (const row of rows) {
      const errors = correction.errors.get(row.ordinal);
      if (row.excluded || (!row.issues.length && !errors)) continue;
      const initial = rowFormValues(row);
      const values = correction.drafts.get(row.ordinal) ?? initial;
      editing.set(row.ordinal, { values, initial, fields: editableFields(row, values, correction, errors) });
    }
  }
  const visible = loading ? COLUMNS : COLUMNS.filter((column) => rows.some((row) =>
    row.issues.some((issue) => issue.field === column.field) || editing.get(row.ordinal)?.fields.has(column.field)
    || !["", UNASSIGNED].includes(column.text(row, mode))));
  const width = (column: Column) => (correction ? column.editWidth : column.width);
  const showStatus = mode !== "preview";
  const columnCount = visible.length + (selectable ? 1 : 0) + (showStatus ? 1 : 0) + (onEdit ? 1 : 0);
  const minWidth = visible.reduce((sum, column) => sum + parseFloat(width(column)), 0) + (selectable ? 3 : 0) + (showStatus ? 10 : 0) + (onEdit ? 5 : 0);

  const allSelected = rows.length > 0 && rows.every((row) => selected?.has(row.ordinal));
  const someSelected = rows.some((row) => selected?.has(row.ordinal));
  const toggle = (ordinals: number[], checked: boolean) => {
    const next = new Set(selected);
    for (const ordinal of ordinals) { if (checked) next.add(ordinal); else next.delete(ordinal); }
    onSelectionChange?.(next);
  };
  return (
    <div className="min-w-0 overflow-x-auto rounded-lg border">
      <Table aria-busy={loading || fetching || undefined} className="table-fixed" style={{ minWidth: `${minWidth}rem` }}>
        <colgroup>
          {selectable && <col style={{ width: "3rem" }} />}
          {visible.map((column) => <col key={column.field} style={{ width: width(column) }} />)}
          {showStatus && <col style={{ width: "10rem" }} />}
          {onEdit && <col style={{ width: "5rem" }} />}
        </colgroup>
        <TableHeader className="bg-muted/40">
          <TableRow className="hover:bg-transparent">
            {selectable && <TableHead className="pl-4"><Checkbox aria-label="Select visible entries" checked={allSelected ? true : someSelected ? "indeterminate" : false} disabled={disabled || loading || fetching || !rows.length} onCheckedChange={(checked) => toggle(rows.map((row) => row.ordinal), checked === true)} /></TableHead>}
            {visible.map((column) => <TableHead key={column.field} className="pl-4">{column.header}</TableHead>)}
            {showStatus && <TableHead className="pl-4">Status</TableHead>}
            {onEdit && <TableHead className="pl-4"><span className="sr-only">Actions</span></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody className={fetching && !loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
          {loading ? Array.from({ length: 8 }, (_, index) => (
            <TableRow key={index} className="hover:bg-transparent">
              {Array.from({ length: columnCount }, (_, cell) => (
                <TableCell key={cell} className="h-11 pl-4"><Skeleton className="h-4 w-3/4" /></TableCell>
              ))}
            </TableRow>
          )) : rows.map((row) => {
            const status = mode === "results" && row.outcome ? row.outcome : row.status;
            const label = mode === "results" && row.outcome ? OUTCOME_LABELS[row.outcome] : STATUS_LABELS[row.status];
            const details = mode === "results" && row.outcome === "created" ? [] : rowMessages(row, rowWord);
            const badge = <Badge variant={BADGE[status]?.variant ?? "outline"} className={BADGE[status]?.className}>{label}</Badge>;
            return (
              <TableRow key={row.ordinal} data-state={selected?.has(row.ordinal) ? "selected" : row.excluded ? "excluded" : undefined} className={row.excluded ? "text-muted-foreground" : undefined}>
                {selectable && <TableCell className="pl-4"><Checkbox aria-label={`Select ${rowWord} ${row.sourceRow}`} checked={selected?.has(row.ordinal) ?? false} disabled={disabled || fetching} onCheckedChange={(checked) => toggle([row.ordinal], checked === true)} /></TableCell>}
                {visible.map((column) => {
                  const edit = editing.get(row.ordinal);
                  if (correction && edit?.fields.has(column.field)) {
                    const key = FORM_FIELDS[column.field];
                    return (
                      <TableCell key={column.field} className={`min-w-0 pl-4 ${column.field === "full_name" ? "text-left" : ""}`}>
                        <ImportCellEditor field={column.field} row={row} rowWord={rowWord} values={edit.values}
                          error={correction.errors.get(row.ordinal)?.[column.field]} changed={edit.values[key] !== edit.initial[key] || Boolean(correction.touched.get(row.ordinal)?.has(key))}
                          onChange={(change) => correction.onChange(row, change)} levels={correction.levels} tracks={correction.tracks}
                          levelNames={correction.levelNames} groups={correction.groups} disabled={disabled} />
                      </TableCell>
                    );
                  }
                  const text = column.text(row, mode);
                  return (
                    <TableCell key={column.field} className={`h-11 min-w-0 pl-4 ${column.bold ? "font-medium" : ""} ${column.field === "full_name" ? "text-left" : ""}`}>
                      <CellText text={text} dir={column.ltr ? "ltr" : "auto"} className={`${row.issues.some((issue) => issue.field === column.field) ? "text-destructive" : column.ltr ? "tabular-nums" : ""} ${column.field === "full_name" ? "text-left" : ""}`}>
                        {text || <span className="text-muted-foreground">—</span>}
                      </CellText>
                    </TableCell>
                  );
                })}
                {showStatus && <TableCell className="pl-4">
                  {details.length > 0 ? <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={0} aria-label={`${label}: ${details.join(" ")}`} className="inline-flex cursor-help rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{badge}</span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm flex-col items-start gap-1 whitespace-normal">
                      {details.map((message, index) => <p key={index}>{message}</p>)}
                    </TooltipContent>
                  </Tooltip> : badge}
                </TableCell>}
                {onEdit && <TableCell className="pl-4">
                  <Button variant="ghost" size="icon-sm" disabled={disabled || fetching} onClick={() => onEdit(row)} aria-label={`Edit ${rowWord} ${row.sourceRow}`}><IconPencil /></Button>
                </TableCell>}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
