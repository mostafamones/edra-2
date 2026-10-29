"use client";

import { useRef, type ReactElement, type RefObject } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { LinkSquare02Icon, MoreHorizontalIcon, PencilEdit01Icon, ViewIcon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AssessmentRow } from "../types";

export type SheetTab = "edit" | "summary";
export type AssessmentEditHandler = (row: AssessmentRow, opener: HTMLElement | null, tab: SheetTab) => void;
type Props = { row: AssessmentRow; onEdit: AssessmentEditHandler };

/** Edit, Summary (both in the edit sheet), then the type's own editor. */
function Items({ row, onEdit, openerRef, openingRef, Item, Separator }: Props & {
  openerRef: RefObject<HTMLElement | null>; openingRef: RefObject<boolean>; Item: typeof ContextMenuItem; Separator: typeof ContextMenuSeparator;
}) {
  const archived = row.item.status === "archived";
  const open = (tab: SheetTab) => { openingRef.current = true; onEdit(row, openerRef.current, tab); };
  return (
    <>
      <Item disabled={archived} onSelect={() => open("edit")}><HugeiconsIcon icon={PencilEdit01Icon} strokeWidth={1.5} />Edit</Item>
      <Item onSelect={() => open("summary")}><HugeiconsIcon icon={ViewIcon} strokeWidth={1.5} />Summary</Item>
      <Separator />
      <Item asChild disabled={archived}>
        <Link href={`${row.href}/edit`}><HugeiconsIcon icon={LinkSquare02Icon} strokeWidth={1.5} />Open editor</Link>
      </Item>
    </>
  );
}

/** Right-click (or the Menu key) on a row or card. */
export function AssessmentMenu({ row, onEdit, children }: Props & { children: ReactElement }) {
  const opening = useRef(false);
  const trigger = useRef<HTMLSpanElement>(null);
  return (
    <ContextMenu>
      <ContextMenuTrigger ref={trigger} asChild tabIndex={0} onKeyDown={(event) => {
        if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        event.currentTarget.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: rect.left + 16, clientY: rect.top + 16 }));
      }}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent onCloseAutoFocus={(event) => { if (opening.current) { event.preventDefault(); opening.current = false; } }}>
        <Items row={row} onEdit={onEdit} openerRef={trigger} openingRef={opening} Item={ContextMenuItem} Separator={ContextMenuSeparator} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** The same actions from a row's Actions button. */
export function AssessmentActions({ row, onEdit }: Props) {
  const opening = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <DropdownMenu>
      <Tooltip delayDuration={500}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button ref={trigger} variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-foreground data-[state=open]:text-foreground" aria-label={`Actions for ${row.item.title}`}>
              <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={1.5} />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Actions</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" onCloseAutoFocus={(event) => { if (opening.current) { event.preventDefault(); opening.current = false; } }}>
        <Items row={row} onEdit={onEdit} openerRef={trigger} openingRef={opening} Item={DropdownMenuItem} Separator={DropdownMenuSeparator} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
