"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { LabelIcon, Settings02Icon } from "@hugeicons/core-free-icons";

import {
  ContextMenuCheckboxItem, ContextMenuItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenuCheckboxItem, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { useLabels } from "../queries";
import type { LabelDomain } from "../types";
import { LabelSwatch } from "./badge";

const CONTEXT = { Sub: ContextMenuSub, SubTrigger: ContextMenuSubTrigger, SubContent: ContextMenuSubContent, Item: ContextMenuItem, CheckboxItem: ContextMenuCheckboxItem, Separator: ContextMenuSeparator };
const DROPDOWN: typeof CONTEXT = { Sub: DropdownMenuSub, SubTrigger: DropdownMenuSubTrigger, SubContent: DropdownMenuSubContent, Item: DropdownMenuItem, CheckboxItem: DropdownMenuCheckboxItem, Separator: DropdownMenuSeparator };

type Props = {
  /** The kind of menu it sits in. */
  menu: "context" | "dropdown";
  academyId: string;
  domain: LabelDomain;
  /** IDs of the labels the record has. */
  applied: readonly string[];
  /** Applies (true) or removes (false) one label; the caller shows the change in `applied` at once. */
  onApply: (labelId: string, applied: boolean) => void;
  /** Shown only to label managers. */
  onManage?: () => void;
};

/** A menu's Labels submenu: check labels on and off, and Manage labels for managers. */
export function LabelsSubmenu(props: Props) {
  const { Sub, SubTrigger, SubContent } = props.menu === "context" ? CONTEXT : DROPDOWN;
  return (
    <Sub>
      <SubTrigger className="gap-2"><HugeiconsIcon icon={LabelIcon} strokeWidth={1.5} aria-hidden="true" />Labels</SubTrigger>
      <SubContent className="max-h-80 min-w-44 overflow-y-auto">
        <Items {...props} />
      </SubContent>
    </Sub>
  );
}

function Items({ menu, academyId, domain, applied, onApply, onManage }: Props) {
  const { Item, CheckboxItem, Separator } = menu === "context" ? CONTEXT : DROPDOWN;
  const labels = useLabels(academyId, domain);
  return (
    <>
      {labels.isPending ? <Item disabled>Loading labels…</Item>
        : labels.isError ? <Item onSelect={(event) => { event.preventDefault(); void labels.refetch(); }}>Couldn’t load labels. Retry</Item>
          : labels.data.length === 0 ? <Item disabled>No labels</Item>
            : labels.data.map((label) => (
              <CheckboxItem key={label.id} checked={applied.includes(label.id)}
                onSelect={(event) => { event.preventDefault(); onApply(label.id, !applied.includes(label.id)); }}>
                <LabelSwatch color={label.color} />
                <span className="truncate">{label.name}</span>
              </CheckboxItem>
            ))}
      {onManage && (
        <>
          <Separator />
          <Item onSelect={onManage}><HugeiconsIcon icon={Settings02Icon} strokeWidth={1.5} aria-hidden="true" />Manage labels</Item>
        </>
      )}
    </>
  );
}
