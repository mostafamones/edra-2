import { useRef, type ReactElement, type RefObject } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Archive02Icon, IdentityCardIcon, MoreHorizontalIcon, PencilEdit02Icon, RestoreBinIcon, UserIdVerificationIcon, ViewIcon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LabelsSubmenu } from "@/modules/labels";
import type { StudentRecordRow } from "../../types";

/** What a row's menus can do. */
export type RowActions = {
  academyId: string;
  /** Owners and admins get the archive/restore actions. */
  canManage: boolean;
  onApplyLabel: (row: StudentRecordRow, labelId: string, applied: boolean) => void;
  /** Opens the label editor beside `opener`; set only for label managers. */
  onManageLabels?: (opener: HTMLElement | null) => void;
  onOpen: (row: StudentRecordRow) => void;
  onArchive: (row: StudentRecordRow, archive: boolean) => void;
  /** Opens the student code dialog; omitted while student codes are off. */
  onCode?: (row: StudentRecordRow) => void;
  /** Developer mode student entry for generated linked students; undefined otherwise. */
  viewAsStudent?: (row: StudentRecordRow) => (() => void) | undefined;
};

type Props = { row: StudentRecordRow; actions: RowActions };

/** The one set of actions in both menus. */
function Items({ row, actions, menu, openerRef, openingRef }: Props & {
  menu: "context" | "dropdown"; openerRef: RefObject<HTMLElement | null>; openingRef: RefObject<boolean>;
}) {
  const { onManageLabels, onCode } = actions;
  const Item: typeof ContextMenuItem = menu === "context" ? ContextMenuItem : DropdownMenuItem;
  const Separator: typeof ContextMenuSeparator = menu === "context" ? ContextMenuSeparator : DropdownMenuSeparator;
  const archived = Boolean(row.archivedAt);
  const view = archived ? undefined : actions.viewAsStudent?.(row);
  return (
    <>
      <Item onSelect={() => actions.onOpen(row)}>
        {archived
          ? <><HugeiconsIcon icon={ViewIcon} strokeWidth={1.5} />View</>
          : <><HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={1.5} />Edit</>}
      </Item>
      {onCode && !archived && <Item onSelect={() => onCode(row)}><HugeiconsIcon icon={IdentityCardIcon} strokeWidth={1.5} />Student code</Item>}
      {view && <Item onSelect={view}><HugeiconsIcon icon={UserIdVerificationIcon} strokeWidth={1.5} />View as student</Item>}
      {/* Labels are organizational metadata: available on archived records too. */}
      <LabelsSubmenu menu={menu} academyId={actions.academyId} domain="students" applied={row.labelIds}
        onApply={(labelId, applied) => actions.onApplyLabel(row, labelId, applied)}
        onManage={onManageLabels && (() => {
          openingRef.current = true;
          const opener = openerRef.current;
          // Open after the menu has closed, so its dismissal cannot close the editor.
          requestAnimationFrame(() => onManageLabels(opener));
        })} />
      {actions.canManage && (
        <>
          <Separator />
          {archived
            ? <Item onSelect={() => actions.onArchive(row, false)}><HugeiconsIcon icon={RestoreBinIcon} strokeWidth={1.5} />Restore</Item>
            : <Item variant="destructive" onSelect={() => actions.onArchive(row, true)}><HugeiconsIcon icon={Archive02Icon} strokeWidth={1.5} />Archive</Item>}
        </>
      )}
    </>
  );
}

/** Right-click (or the Menu key) on a row. */
export function StudentRowMenu({ row, actions, children }: Props & { children: ReactElement }) {
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
      <ContextMenuContent className="w-44" onCloseAutoFocus={(event) => { if (opening.current) { event.preventDefault(); opening.current = false; } }}>
        <Items row={row} actions={actions} menu="context" openerRef={trigger} openingRef={opening} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** The same actions from a row's Actions button. */
export function StudentRowActions({ row, actions }: Props) {
  const opening = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <DropdownMenu>
      <Tooltip delayDuration={500}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button ref={trigger} variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={`Actions for ${row.fullName}`}>
              <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={1.5} />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Actions</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-44" onCloseAutoFocus={(event) => { if (opening.current) { event.preventDefault(); opening.current = false; } }}>
        <Items row={row} actions={actions} menu="dropdown" openerRef={trigger} openingRef={opening} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
