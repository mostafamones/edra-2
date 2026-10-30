"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Archive02Icon, ArrowLeftRightIcon, IdentityCardIcon, MoreHorizontalIcon, PencilEdit02Icon, RestoreBinIcon, UserIdVerificationIcon, ViewIcon } from "@hugeicons/core-free-icons";
import type { ColumnDef } from "@tanstack/react-table";
import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { StudentRecordRow } from "../../types";
import { formatPhone, PARTICIPATION_LABELS } from "../../validation";
import {
  ACTIONS_COLUMN, ACTIONS_WIDTH, COLUMN_LABELS, COLUMN_WIDTHS, SELECT_COLUMN, SELECT_WIDTH, type DataColumnId,
} from "../../table/config";
import { AccountDot } from "./account-dot";
import { CellText } from "./cell-text";

export type ColumnOptions = {
  /** Owners and admins get the selection column and archive/restore actions. */
  canManage: boolean;
  isSelected: (id: string) => boolean;
  pageSelection: boolean | "indeterminate";
  onToggleRow: (row: StudentRecordRow, selected: boolean) => void;
  onTogglePage: (selected: boolean) => void;
  onOpen: (row: StudentRecordRow) => void;
  detailsHref: (row: StudentRecordRow) => string;
  onArchive: (row: StudentRecordRow, archive: boolean) => void;
  /** Opens the student code dialog; omitted while student codes are off. */
  onCode?: (row: StudentRecordRow) => void;
  /** Developer mode student entry for generated linked students; undefined otherwise. */
  viewAsStudent?: (row: StudentRecordRow) => (() => void) | undefined;
  /** Current code per record id for the rows on this page; the column is hidden while codes are off. */
  codes: Record<string, string>;
};

const sameName = (a: string, b: string) => a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase();

/** The name opens the student; a separate control switches to the linked account name. */
function NameToggle({ recordName, accountName, href }: { recordName: string; accountName: string | null; href: string }) {
  const [showAccount, setShowAccount] = useState(false);
  if (!accountName || sameName(accountName, recordName)) return <Link href={href} className="truncate rounded-sm font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring">{recordName}</Link>;
  const name = showAccount ? accountName : recordName;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex min-w-0 items-center gap-1"><Link href={href} className="truncate rounded-sm font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring">{name}</Link><button type="button" aria-label="Switch record and account name" aria-pressed={showAccount} onClick={() => setShowAccount((value) => !value)} className="rounded-sm p-1 text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"><HugeiconsIcon icon={ArrowLeftRightIcon} strokeWidth={1.5} className="size-4" aria-hidden="true" /></button></span>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm break-words">
        <span dir="auto" className="block">{name}</span>
        <span className="block opacity-70">{showAccount ? "Account name" : "Record name"}</span>
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
    data("name", ({ row }) => (
      // dir="auto" puts the dot after the name in its reading direction, including Arabic names.
      <div dir="auto" className="inline-flex max-w-full min-w-0 items-center gap-1.5 align-middle">
        <NameToggle recordName={row.original.fullName} accountName={row.original.accountName} href={options.detailsHref(row.original)} />
        <AccountDot state={row.original.onlineAccount} />
      </div>
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
      const view = archived ? undefined : options.viewAsStudent?.(row.original);
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={`Actions for ${row.original.fullName}`}>
              <HugeiconsIcon icon={MoreHorizontalIcon} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onSelect={() => options.onOpen(row.original)}>
              {archived ? <><HugeiconsIcon icon={ViewIcon} />View</> : <><HugeiconsIcon icon={PencilEdit02Icon} />Edit</>}
            </DropdownMenuItem>
            {options.onCode && !archived && (
              <DropdownMenuItem onSelect={() => options.onCode?.(row.original)}><HugeiconsIcon icon={IdentityCardIcon} />Student code</DropdownMenuItem>
            )}
            {view && <DropdownMenuItem onSelect={view}><HugeiconsIcon icon={UserIdVerificationIcon} />View as student</DropdownMenuItem>}
            {options.canManage && (
              <>
                <DropdownMenuSeparator />
                {archived ? (
                  <DropdownMenuItem onSelect={() => options.onArchive(row.original, false)}><HugeiconsIcon icon={RestoreBinIcon} />Restore</DropdownMenuItem>
                ) : (
                  <DropdownMenuItem variant="destructive" onSelect={() => options.onArchive(row.original, true)}><HugeiconsIcon icon={Archive02Icon} />Archive</DropdownMenuItem>
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
