"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Settings02Icon, Tag01Icon } from "@hugeicons/core-free-icons";

import {
  ContextMenuCheckboxItem, ContextMenuItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import { useLabels } from "../queries";
import { LabelSwatch } from "./badge";

type Props = {
  academyId: string;
  /** IDs of the labels the record has. */
  applied: readonly string[];
  /** Applies (true) or removes (false) one label; the caller shows the change in `applied` at once. */
  onApply: (labelId: string, applied: boolean) => void;
  /** Shown only to label managers. */
  onManage?: () => void;
};

/** A context menu's Labels submenu: check labels on and off, and Manage labels for managers. */
export function LabelsSubmenu(props: Props) {
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger><HugeiconsIcon icon={Tag01Icon} strokeWidth={1.5} aria-hidden="true" />Labels</ContextMenuSubTrigger>
      <ContextMenuSubContent className="max-h-80 min-w-44 overflow-y-auto">
        <Items {...props} />
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}

function Items({ academyId, applied, onApply, onManage }: Props) {
  const labels = useLabels(academyId);
  return (
    <>
      {labels.isPending ? <ContextMenuItem disabled>Loading labels…</ContextMenuItem>
        : labels.isError ? <ContextMenuItem onSelect={(event) => { event.preventDefault(); void labels.refetch(); }}>Couldn’t load labels. Retry</ContextMenuItem>
          : labels.data.length === 0 ? <ContextMenuItem disabled>No labels</ContextMenuItem>
            : labels.data.map((label) => (
              <ContextMenuCheckboxItem key={label.id} checked={applied.includes(label.id)}
                onSelect={(event) => { event.preventDefault(); onApply(label.id, !applied.includes(label.id)); }}>
                <LabelSwatch color={label.color} />
                <span className="truncate">{label.name}</span>
              </ContextMenuCheckboxItem>
            ))}
      {onManage && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={onManage}><HugeiconsIcon icon={Settings02Icon} strokeWidth={1.5} aria-hidden="true" />Manage labels</ContextMenuItem>
        </>
      )}
    </>
  );
}
