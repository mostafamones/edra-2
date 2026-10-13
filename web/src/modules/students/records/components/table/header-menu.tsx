"use client";

import { IconArrowDown, IconArrowUp, IconArrowsHorizontal, IconArrowsSort, IconEyeOff, IconPlaylistAdd, IconX } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub,
  DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MAX_SORTS, type SortDescriptor, type SortField } from "../../list-params";
import type { DataColumnId } from "../../table/config";

type Props = {
  columnId: DataColumnId;
  label: string;
  sorts: SortDescriptor[];
  onSortsChange: (sorts: SortDescriptor[]) => void;
  canHide: boolean;
  onHide: () => void;
  resized: boolean;
  onResetWidth: () => void;
};

/** A column header that opens sorting, width, and visibility actions for its column. */
export function HeaderMenu({ columnId: column, label, sorts, onSortsChange, canHide, onHide, resized, onResetWidth }: Props) {
  // Columns without a database sort (the student code) offer only width and visibility.
  const columnId = column === "code" ? null : (column as SortField);
  const index = columnId ? sorts.findIndex((sort) => sort.id === columnId) : -1;
  const sort = index >= 0 ? sorts[index] : undefined;
  const canAdd = sorts.length > 0 && !sort && sorts.length < MAX_SORTS;
  const direction = sort ? (sort.desc ? "descending" : "ascending") : null;
  const SortIcon = sort ? (sort.desc ? IconArrowDown : IconArrowUp) : IconArrowsSort;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 max-w-full min-w-0 justify-start gap-1 px-2 font-medium data-[state=open]:bg-muted"
          aria-label={`${label}${direction ? `, sorted ${direction}${sorts.length > 1 ? `, priority ${index + 1}` : ""}` : ""}. Column options`}
        >
          <span className="truncate">{label}</span>
          {columnId && <SortIcon className={sort ? "text-foreground" : "text-muted-foreground/60"} aria-hidden="true" />}
          {sort && sorts.length > 1 && (
            <span className="rounded-sm bg-muted px-1 text-[0.65rem] leading-4 tabular-nums text-muted-foreground" aria-hidden="true">{index + 1}</span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {columnId && (
          <>
            <DropdownMenuItem onSelect={() => onSortsChange([{ id: columnId, desc: false }])}><IconArrowUp />Sort ascending</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onSortsChange([{ id: columnId, desc: true }])}><IconArrowDown />Sort descending</DropdownMenuItem>
            {sort && sorts.length > 1 && (
              <DropdownMenuItem onSelect={() => onSortsChange(sorts.map((item) => (item.id === columnId ? { ...item, desc: !item.desc } : item)))}>
                <IconArrowsSort />Reverse this sort
              </DropdownMenuItem>
            )}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={!canAdd}><IconPlaylistAdd />Add to existing sort</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onSelect={() => onSortsChange([...sorts, { id: columnId, desc: false }])}><IconArrowUp />Ascending</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onSortsChange([...sorts, { id: columnId, desc: true }])}><IconArrowDown />Descending</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            {sort && (
              <DropdownMenuItem onSelect={() => onSortsChange(sorts.filter((item) => item.id !== columnId))}><IconX />Remove sort</DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem disabled={!resized} onSelect={onResetWidth}><IconArrowsHorizontal />Reset width</DropdownMenuItem>
        {canHide && <DropdownMenuItem onSelect={onHide}><IconEyeOff />Hide column</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
