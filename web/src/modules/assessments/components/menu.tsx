"use client";

import { useRef, type ReactElement, type RefObject } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Archive02Icon, CheckListIcon, LinkSquare02Icon, LockIcon, MoreHorizontalIcon, PencilEdit01Icon, ViewIcon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LabelsSubmenu } from "@/modules/labels";
import type { LifecycleAction } from "../lifecycle";
import type { AssessmentListItem, AssessmentRow } from "../types";

export type SheetTab = "edit" | "summary" | "mark";
export type AssessmentEditHandler = (row: AssessmentRow, opener: HTMLElement | null, tab: SheetTab) => void;
/** What a row or card's menus can do. `onManageLabels` is set only for label managers, `onLifecycle` for academy managers in an open year. */
export type RowActions = {
  academyId: string;
  onEdit: AssessmentEditHandler;
  onApplyLabel: (item: AssessmentListItem, labelId: string, applied: boolean) => Promise<void>;
  onManageLabels?: (opener: HTMLElement | null) => void;
  onLifecycle?: (row: AssessmentRow, action: LifecycleAction, opener: HTMLElement | null) => void;
};

type Props = { row: AssessmentRow; actions: RowActions };

/** The one set of actions in both menus: Edit, Summary, Mark (all in the edit sheet) and Labels, the type's own editor, then Close and Archive. */
function Items({ row, actions, menu, openerRef, openingRef }: Props & {
  menu: "context" | "dropdown"; openerRef: RefObject<HTMLElement | null>; openingRef: RefObject<boolean>;
}) {
  const { item } = row;
  const { onEdit, onManageLabels, onLifecycle } = actions;
  const Item: typeof ContextMenuItem = menu === "context" ? ContextMenuItem : DropdownMenuItem;
  const Separator: typeof ContextMenuSeparator = menu === "context" ? ContextMenuSeparator : DropdownMenuSeparator;
  const archived = item.status === "archived";
  const open = (tab: SheetTab) => { openingRef.current = true; onEdit(row, openerRef.current, tab); };
  const change = (action: LifecycleAction) => { openingRef.current = true; onLifecycle?.(row, action, openerRef.current); };
  // Assignments close from Active; quizzes and exams only while their window is open.
  const closable = item.status === (item.type === "assignment" ? "active" : "open");
  return (
    <>
      <Item disabled={archived} onSelect={() => open("edit")}><HugeiconsIcon icon={PencilEdit01Icon} strokeWidth={1.5} />Edit</Item>
      <Item onSelect={() => open("summary")}><HugeiconsIcon icon={ViewIcon} strokeWidth={1.5} />Summary</Item>
      <Item disabled={archived} onSelect={() => open("mark")}><HugeiconsIcon icon={CheckListIcon} strokeWidth={1.5} />Mark</Item>
      {/* Labels are organizational metadata: available on archived and closed-year assessments too. */}
      <LabelsSubmenu menu={menu} academyId={actions.academyId} applied={item.labels.map((label) => label.id)}
        onApply={(labelId, applied) => void actions.onApplyLabel(item, labelId, applied)}
        onManage={onManageLabels && (() => {
          openingRef.current = true;
          const opener = openerRef.current;
          // Open after the menu has closed, so its dismissal cannot close the editor.
          requestAnimationFrame(() => onManageLabels(opener));
        })} />
      <Separator />
      <Item asChild disabled={archived}>
        <Link href={`${row.href}/edit`}><HugeiconsIcon icon={LinkSquare02Icon} strokeWidth={1.5} />Open editor</Link>
      </Item>
      {onLifecycle && !archived && (
        <>
          <Separator />
          {closable && <Item onSelect={() => change("close")}><HugeiconsIcon icon={LockIcon} strokeWidth={1.5} />Close</Item>}
          <Item variant="destructive" onSelect={() => change("archive")}><HugeiconsIcon icon={Archive02Icon} strokeWidth={1.5} />Archive</Item>
        </>
      )}
    </>
  );
}

/** Right-click (or the Menu key) on a row or card. */
export function AssessmentMenu({ row, actions, children }: Props & { children: ReactElement }) {
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
        <Items row={row} actions={actions} menu="context" openerRef={trigger} openingRef={opening} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** The same actions from a row's Actions button. */
export function AssessmentActions({ row, actions }: Props) {
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
        <Items row={row} actions={actions} menu="dropdown" openerRef={trigger} openingRef={opening} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
