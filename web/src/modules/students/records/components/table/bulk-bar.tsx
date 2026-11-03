import { HugeiconsIcon } from "@hugeicons/react";
import { Archive02Icon, Cancel01Icon, FolderEditIcon, RestoreBinIcon } from "@hugeicons/core-free-icons";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ActionBar, ActionBarSeparator } from "@/components/ui/action-bar";

type Props = {
  selected: number;
  /** The Labels action, available to all staff. */
  labels: ReactNode;
  /** Group, archive and restore; omitted for Instructors. */
  manager?: {
    /** Selected active records that can be archived. */
    archivable: number;
    /** Selected archived records that can be restored. */
    restorable: number;
    onArchive: () => void;
    onRestore: () => void;
    onChangeGroup: () => void;
  };
  onClear: () => void;
};

/** Selection count, labels, and the managers' group, archive, and restore actions, pinned to the viewport bottom beside toasts so the table never shifts. */
export function BulkBar({ selected, labels, manager, onClear }: Props) {
  return (
    <ActionBar aria-label="Selected students">
      <span className="px-2 font-medium tabular-nums" aria-live="polite">{selected} selected</span>
      <ActionBarSeparator />
      {labels}
      {manager && (
        <Button variant="ghost" size="sm" onClick={manager.onChangeGroup}>
          <HugeiconsIcon icon={FolderEditIcon} />Change group
        </Button>
      )}
      {manager && manager.archivable > 0 && (
        <Button variant="ghost" size="sm" onClick={manager.onArchive}>
          <HugeiconsIcon icon={Archive02Icon} />Archive
        </Button>
      )}
      {manager && manager.restorable > 0 && (
        <Button variant="ghost" size="sm" onClick={manager.onRestore}>
          <HugeiconsIcon icon={RestoreBinIcon} />Restore
        </Button>
      )}
      <Button variant="ghost" size="icon-sm" onClick={onClear} aria-label="Clear selection"><HugeiconsIcon icon={Cancel01Icon} className="text-destructive" /></Button>
    </ActionBar>
  );
}
