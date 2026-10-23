"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Archive02Icon, Cancel01Icon, FolderEditIcon, RestoreBinIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

type Props = {
  selected: number;
  /** Selected active records that can be archived. */
  archivable: number;
  /** Selected archived records that can be restored. */
  restorable: number;
  onArchive: () => void;
  onRestore: () => void;
  onChangeGroup: () => void;
  onClear: () => void;
};

/** Selection count and the group, archive, and restore actions, pinned to the viewport bottom beside toasts so the table never shifts. */
export function BulkBar({ selected, archivable, restorable, onArchive, onRestore, onChangeGroup, onClear }: Props) {
  return (
    <div
      role="region"
      aria-label="Selected students"
      className="fixed bottom-6 left-1/2 z-40 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center gap-1 rounded-lg border bg-popover p-1.5 text-sm shadow-lg animate-in fade-in slide-in-from-bottom-2"
    >
      <span className="px-2 font-medium tabular-nums" aria-live="polite">{selected} selected</span>
      <Separator orientation="vertical" className="mx-1 h-5! self-center!" />
      <Button variant="ghost" size="sm" onClick={onChangeGroup}>
        <HugeiconsIcon icon={FolderEditIcon} />Change group
      </Button>
      {archivable > 0 && (
        <Button variant="ghost" size="sm" onClick={onArchive}>
          <HugeiconsIcon icon={Archive02Icon} />Archive
        </Button>
      )}
      {restorable > 0 && (
        <Button variant="ghost" size="sm" onClick={onRestore}>
          <HugeiconsIcon icon={RestoreBinIcon} />Restore
        </Button>
      )}
      <Button variant="ghost" size="icon-sm" onClick={onClear} aria-label="Clear selection"><HugeiconsIcon icon={Cancel01Icon} className="text-destructive" /></Button>
    </div>
  );
}
