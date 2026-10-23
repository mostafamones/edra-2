"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Archive02Icon, Cancel01Icon, FolderEditIcon, RestoreBinIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";

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

/** Selection count and the group, archive, and restore actions for selected students. */
export function BulkBar({ selected, archivable, restorable, onArchive, onRestore, onChangeGroup, onClear }: Props) {
  return (
    <div role="region" aria-label="Selected students" className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
      <span className="font-medium tabular-nums" aria-live="polite">{selected} selected</span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onClear}><HugeiconsIcon icon={Cancel01Icon} />Clear</Button>
        <Button variant="outline" size="sm" onClick={onChangeGroup}>
          <HugeiconsIcon icon={FolderEditIcon} />Change group
        </Button>
        {archivable > 0 && (
          <Button variant="outline" size="sm" onClick={onArchive}>
            <HugeiconsIcon icon={Archive02Icon} />Archive ({archivable})
          </Button>
        )}
        {restorable > 0 && (
          <Button variant="outline" size="sm" onClick={onRestore}>
            <HugeiconsIcon icon={RestoreBinIcon} />Restore ({restorable})
          </Button>
        )}
      </div>
    </div>
  );
}
