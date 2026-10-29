"use client";

import { useRef, type ReactElement } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { LinkSquare02Icon, PencilEdit01Icon, ViewIcon } from "@hugeicons/core-free-icons";

import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import type { AssessmentListItem } from "../types";

export type AssessmentEditHandler = (item: AssessmentListItem, opener: HTMLElement | null) => void;
type Props = { item: AssessmentListItem; href: string; onEdit: AssessmentEditHandler; children: ReactElement };

export function AssessmentMenu({ item, href, onEdit, children }: Props) {
  const editing = useRef(false);
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
      <ContextMenuContent onCloseAutoFocus={(event) => { if (editing.current) { event.preventDefault(); editing.current = false; } }}>
        <ContextMenuItem asChild><Link href={href}><HugeiconsIcon icon={ViewIcon} strokeWidth={1.5} />Open</Link></ContextMenuItem>
        <ContextMenuItem disabled={item.status === "archived"} onSelect={() => { editing.current = true; onEdit(item, trigger.current); }}>
          <HugeiconsIcon icon={PencilEdit01Icon} strokeWidth={1.5} />Edit
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem asChild disabled={item.status === "archived"}>
          <Link href={`${href}/edit`}><HugeiconsIcon icon={LinkSquare02Icon} strokeWidth={1.5} />Open full editor</Link>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
