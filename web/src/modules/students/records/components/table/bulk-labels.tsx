import { useRef } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { LabelIcon, Loading03Icon, Settings02Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub,
  DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LabelSwatch, useLabels, type Label } from "@/modules/labels";

type Props = {
  academyId: string;
  /** A bulk write is running: nothing else can start. */
  pending: boolean;
  /** Applies (true) or removes (false) one label on the whole selection; other labels stay. */
  onApply: (label: Label, applied: boolean) => void;
  /** Shown only to label managers. */
  onManage?: (opener: HTMLElement | null) => void;
};

/** The selection bar's Labels menu: explicit Apply and Remove, never a replacement of a record's labels. */
export function BulkLabels({ academyId, pending, onApply, onManage }: Props) {
  const trigger = useRef<HTMLButtonElement>(null);
  const labels = useLabels(academyId, "students");
  const items = (applied: boolean) => labels.isPending ? <DropdownMenuItem disabled>Loading labels…</DropdownMenuItem>
    : labels.isError ? <DropdownMenuItem onSelect={(event) => { event.preventDefault(); void labels.refetch(); }}>Couldn’t load labels. Retry</DropdownMenuItem>
      : labels.data.length === 0 ? <DropdownMenuItem disabled>No labels</DropdownMenuItem>
        : labels.data.map((label) => (
          <DropdownMenuItem key={label.id} onSelect={() => onApply(label, applied)}>
            <LabelSwatch color={label.color} />
            <span dir="auto" className="truncate">{label.name}</span>
          </DropdownMenuItem>
        ));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button ref={trigger} variant="ghost" size="sm" disabled={pending} aria-busy={pending}>
          <HugeiconsIcon icon={pending ? Loading03Icon : LabelIcon} strokeWidth={1.5} className={pending ? "animate-spin" : undefined} aria-hidden="true" />Labels
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-44">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Apply label</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-80 max-w-64 min-w-44 overflow-y-auto">{items(true)}</DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Remove label</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-80 max-w-64 min-w-44 overflow-y-auto">{items(false)}</DropdownMenuSubContent>
        </DropdownMenuSub>
        {onManage && (
          <>
            <DropdownMenuSeparator />
            {/* Open after the menu has closed, so its dismissal cannot close the editor. */}
            <DropdownMenuItem onSelect={() => requestAnimationFrame(() => onManage(trigger.current))}>
              <HugeiconsIcon icon={Settings02Icon} strokeWidth={1.5} aria-hidden="true" />Manage labels
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
