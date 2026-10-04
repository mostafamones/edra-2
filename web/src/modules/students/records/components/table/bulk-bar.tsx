"use client";

import { Archive, ArchiveRestore, FolderInput, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { IconArchive, IconFolderCog, IconFolderUser, IconRestore, IconX } from "@tabler/icons-react";

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
        <Button variant="ghost" size="sm" onClick={onClear}><IconX />Clear</Button>
        <Button variant="outline" size="sm" onClick={onChangeGroup}>
          <IconFolderCog />Change group
        </Button>
        {archivable > 0 && (
          <Button variant="outline" size="sm" onClick={onArchive}>
            <IconArchive />Archive ({archivable})
          </Button>
        )}
        {restorable > 0 && (
          <Button variant="outline" size="sm" onClick={onRestore}>
            <IconRestore />Restore ({restorable})
          </Button>
        )}
      </div>
    </div>
  );
}
