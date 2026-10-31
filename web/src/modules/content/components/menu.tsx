"use client";

import { useRef, type ReactElement, type RefObject } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Archive02Icon, ArchiveRestoreIcon, Clock01Icon, Copy01Icon, LinkSquare02Icon, MoreHorizontalIcon, PencilEdit01Icon, ViewIcon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LabelsSubmenu } from "@/modules/labels";
import { canEditUnit, type ContentUnit } from "../types";
import { UNIT_ACTIONS, unitAction, type UnitAction } from "./unit-action";

export type UnitSheetTab = "edit" | "history" | "content";

/** What a card's menus can do. `writable` means the unit's year is open; `manager` is display-only, the database decides. `onManageLabels` is set only for label managers. */
export type UnitMenuActions = {
  academyId: string;
  labelIds: Record<string, string[]>;
  onApplyLabel: (unit: ContentUnit, labelId: string, applied: boolean) => void;
  onManageLabels?: (opener: HTMLElement | null) => void;
  writable: boolean;
  manager: boolean;
  userId: string;
  onAction: (unit: ContentUnit, action: UnitAction) => void;
  onClone: (unit: ContentUnit, opener: HTMLElement | null) => void;
  onArchive: (unit: ContentUnit, opener: HTMLElement | null) => void;
  onRestore: (unit: ContentUnit) => void;
  onSheet: (unit: ContentUnit, opener: HTMLElement | null, tab: UnitSheetTab) => void;
};

type Props = { unit: ContentUnit; href: string; actions: UnitMenuActions };

/** The one set of actions in both menus: looking at the unit, changing it, then its lifecycle. */
function Items({ unit, href, actions, menu, openerRef, openingRef }: Props & {
  menu: "context" | "dropdown"; openerRef: RefObject<HTMLElement | null>; openingRef: RefObject<boolean>;
}) {
  const Item: typeof ContextMenuItem = menu === "context" ? ContextMenuItem : DropdownMenuItem;
  const Separator: typeof ContextMenuSeparator = menu === "context" ? ContextMenuSeparator : DropdownMenuSeparator;
  const { writable, manager, onClone, onArchive, onRestore, onManageLabels } = actions;
  const archived = unit.state === "archived";
  const sheet = (tab: UnitSheetTab) => { openingRef.current = true; actions.onSheet(unit, openerRef.current, tab); };
  const next = unitAction(unit, { editable: writable && canEditUnit(unit, actions.userId, manager), manager, changed: unit.version !== unit.published_version });
  const lifecycle = writable && manager;
  return (
    <>
      <Item asChild><Link href={href}><HugeiconsIcon icon={LinkSquare02Icon} strokeWidth={1.5} />Open editor</Link></Item>
      <Item onSelect={() => sheet("content")}><HugeiconsIcon icon={ViewIcon} strokeWidth={1.5} />Preview content</Item>
      <Item onSelect={() => sheet("history")}><HugeiconsIcon icon={Clock01Icon} strokeWidth={1.5} />Version history</Item>
      <Separator />
      <Item onSelect={() => sheet("edit")}><HugeiconsIcon icon={PencilEdit01Icon} strokeWidth={1.5} />Edit details</Item>
      {/* Labels are organizational metadata: available on archived and closed-year units too. */}
      <LabelsSubmenu menu={menu} academyId={actions.academyId} domain="content" applied={actions.labelIds[unit.id] ?? []}
        onApply={(labelId, applied) => actions.onApplyLabel(unit, labelId, applied)}
        onManage={onManageLabels && (() => {
          openingRef.current = true;
          const opener = openerRef.current;
          // Open after the menu has closed, so its dismissal cannot close the editor.
          requestAnimationFrame(() => onManageLabels(opener));
        })} />
      {/* Only published units can be copied. */}
      {writable && unit.state === "published" && (
        <Item onSelect={() => { openingRef.current = true; onClone(unit, openerRef.current); }}><HugeiconsIcon icon={Copy01Icon} strokeWidth={1.5} />Clone</Item>
      )}
      {(next || lifecycle) && <Separator />}
      {next && <Item onSelect={() => actions.onAction(unit, next)}><HugeiconsIcon icon={UNIT_ACTIONS[next].icon} strokeWidth={1.5} />{UNIT_ACTIONS[next].label}</Item>}
      {lifecycle && (archived
        ? <Item onSelect={() => onRestore(unit)}><HugeiconsIcon icon={ArchiveRestoreIcon} strokeWidth={1.5} />Restore as draft</Item>
        : <Item variant="destructive" onSelect={() => { openingRef.current = true; onArchive(unit, openerRef.current); }}><HugeiconsIcon icon={Archive02Icon} strokeWidth={1.5} />Archive</Item>)}
    </>
  );
}

/** Right-click (or the Menu key) on a card. */
export function UnitMenu({ unit, href, actions, children }: Props & { children: ReactElement }) {
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
        <Items unit={unit} href={href} actions={actions} menu="context" openerRef={trigger} openingRef={opening} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** The same actions from a card's Actions button. */
export function UnitActions({ unit, href, actions }: Props) {
  const opening = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <DropdownMenu>
      <Tooltip delayDuration={500}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button ref={trigger} variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-foreground data-[state=open]:text-foreground" aria-label={`Actions for ${unit.draft.title}`}>
              <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={1.5} />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Actions</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" onCloseAutoFocus={(event) => { if (opening.current) { event.preventDefault(); opening.current = false; } }}>
        <Items unit={unit} href={href} actions={actions} menu="dropdown" openerRef={trigger} openingRef={opening} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
