"use client";

import { useRef, type ReactElement } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { LinkSquare02Icon, PencilEdit01Icon, ViewIcon } from "@hugeicons/core-free-icons";

import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { LabelsSubmenu } from "@/modules/labels";
import type { AssessmentListItem } from "../types";

export type AssessmentEditHandler = (item: AssessmentListItem, opener: HTMLElement | null) => void;
/** What a row or card's context menu can do. `onManageLabels` is set only for label managers. */
export type RowActions = {
  academyId: string;
  onEdit: AssessmentEditHandler;
  onApplyLabel: (item: AssessmentListItem, labelId: string, applied: boolean) => Promise<void>;
  onManageLabels?: (opener: HTMLElement | null) => void;
};
type Props = { item: AssessmentListItem; href: string; actions: RowActions; children: ReactElement };

export function AssessmentMenu({ item, href, actions, children }: Props) {
  // Set when a menu action opens another surface that takes focus and later returns it to this row.
  const handingOff = useRef(false);
  const trigger = useRef<HTMLSpanElement>(null);
  const { onEdit, onManageLabels } = actions;
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
      <ContextMenuContent onCloseAutoFocus={(event) => { if (handingOff.current) { event.preventDefault(); handingOff.current = false; } }}>
        <ContextMenuItem asChild><Link href={href}><HugeiconsIcon icon={ViewIcon} strokeWidth={1.5} />Open</Link></ContextMenuItem>
        <ContextMenuItem disabled={item.status === "archived"} onSelect={() => { handingOff.current = true; onEdit(item, trigger.current); }}>
          <HugeiconsIcon icon={PencilEdit01Icon} strokeWidth={1.5} />Edit
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem asChild disabled={item.status === "archived"}>
          <Link href={`${href}/edit`}><HugeiconsIcon icon={LinkSquare02Icon} strokeWidth={1.5} />Open full editor</Link>
        </ContextMenuItem>
        <ContextMenuSeparator />
        {/* Labels are organizational metadata: available on archived and closed-year assessments too. */}
        <LabelsSubmenu academyId={actions.academyId} applied={item.labels.map((label) => label.id)}
          onApply={(labelId, applied) => actions.onApplyLabel(item, labelId, applied)}
          onManage={onManageLabels && (() => {
            handingOff.current = true;
            const opener = trigger.current;
            // Open after the menu has closed, so its dismissal cannot close the editor.
            requestAnimationFrame(() => onManageLabels(opener));
          })} />
      </ContextMenuContent>
    </ContextMenu>
  );
}
