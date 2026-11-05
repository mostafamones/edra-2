import type { ColumnDef } from "@tanstack/react-table";
import { useState } from "react";
import { format } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LabelOverflow, type Label } from "@/modules/labels";
import type { StudentRecordRow } from "../../types";
import { formatPhone, PARTICIPATION_LABELS } from "../../validation";
import {
  ACTIONS_COLUMN, ACTIONS_WIDTH, COLUMN_LABELS, COLUMN_WIDTHS, SELECT_COLUMN, SELECT_WIDTH, type DataColumnId,
} from "../../table/config";
import { AccountDot } from "./account-dot";
import { CellText } from "./cell-text";
import { StudentRowActions, type RowActions } from "./row-menu";

export type ColumnOptions = RowActions & {
  /** Staff who may apply labels get the selection column. */
  canSelect: boolean;
  /** The students catalog; undefined until it loads. */
  catalog: readonly Label[] | undefined;
  catalogFailed: boolean;
  isSelected: (id: string) => boolean;
  pageSelection: boolean | "indeterminate";
  onToggleRow: (row: StudentRecordRow, selected: boolean) => void;
  onTogglePage: (selected: boolean) => void;
  /** Current code per record id for the rows on this page; the column is hidden while codes are off. */
  codes: Record<string, string>;
};

const sameName = (a: string, b: string) => a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase();

/** The linked account's own name when it differs from the record name; the cell blurs on hover and swaps names on click, until the page reloads. */
function NameToggle({ recordName, accountName }: { recordName: string; accountName: string | null }) {
  const [showAccount, setShowAccount] = useState(true);
  if (!accountName || sameName(accountName, recordName)) return <CellText text={recordName} className="font-medium">{recordName}</CellText>;
  const name = showAccount ? accountName : recordName;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-pressed={showAccount}
          onClick={() => setShowAccount((value) => !value)}
          className="block min-w-0 truncate rounded-sm text-start font-medium text-foreground outline-none transition-[filter] hover:blur-[2px] focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {name}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm break-words">
        <span dir="auto" className="block">{name}</span>
        <span className="block opacity-70">{showAccount ? "Account name · Click to show record name" : "Record name · Click to show account name"}</span>
      </TooltipContent>
    </Tooltip>
  );
}

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
  if (options.canSelect) {
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
          className="mx-auto"
        />
      ),
    });
  }

  columns.push(
    data("code", ({ row }) => {
      const code = options.codes[row.original.id];
      return code ? <CellText text={code} className="font-mono">{code}</CellText> : muted("—", "No code");
    }),
    data("name", ({ row }) => {
      const { labelIds } = row.original;
      return (
        <div className="flex min-w-0 items-center gap-2">
          {/* dir="auto" puts the dot after the name in its reading direction, including Arabic names. */}
          <div dir="auto" className="inline-flex min-w-0 items-center gap-1.5">
            <NameToggle recordName={row.original.fullName} accountName={row.original.accountName} />
            <AccountDot state={row.original.onlineAccount} manuallySuspended={row.original.manuallySuspended} />
          </div>
          {labelIds.length > 0 && (options.catalog
            ? <LabelOverflow labels={options.catalog.filter((label) => labelIds.includes(label.id))} className="min-w-20" />
            : !options.catalogFailed && <Skeleton className="h-5 w-16" />)}
        </div>
      );
    }),
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
    cell: ({ row }) => <StudentRowActions row={row.original} actions={options} />,
  });
  return columns;
}
