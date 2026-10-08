"use client";

import { IconChevronLeft, IconChevronRight, IconTrash } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ImageFrame } from "./frame";

type Props = {
  ids: string[];
  /** The open image, or null when closed. */
  index: number | null;
  onIndexChange: (index: number | null) => void;
  onRemove: (id: string) => void;
};

/** The images of one field at full size, one at a time; arrow keys step through them. */
export function ImageViewer({ ids, index, onIndexChange, onRemove }: Props) {
  const current = index === null || ids.length === 0 ? null : Math.min(index, ids.length - 1);
  const id = current === null ? undefined : ids[current];
  const step = (delta: number) => { if (current !== null) onIndexChange(Math.max(0, Math.min(ids.length - 1, current + delta))); };

  return (
    <Dialog open={id !== undefined} onOpenChange={(open) => { if (!open) onIndexChange(null); }}>
      {/* Focus the dialog itself, not Remove: Enter must not delete an image by accident. */}
      <DialogContent className="sm:max-w-3xl" onOpenAutoFocus={(event) => { event.preventDefault(); (event.currentTarget as HTMLElement).focus(); }} onKeyDown={(event) => {
        if (event.key === "ArrowLeft") step(-1);
        if (event.key === "ArrowRight") step(1);
      }}>
        <DialogHeader>
          <DialogTitle>Image {(current ?? 0) + 1}</DialogTitle>
          <DialogDescription>{ids.length > 1 ? `${(current ?? 0) + 1} of ${ids.length} images in this field` : "Pasted into this field"}</DialogDescription>
        </DialogHeader>
        {id && <ImageFrame id={id} className="h-[min(65vh,36rem)]" />}
        <DialogFooter className="items-center sm:justify-between">
          <Button type="button" variant="ghost" size="sm" className="text-destructive/80 hover:text-destructive" onClick={() => { if (id) onRemove(id); }}>
            <IconTrash />Remove image
          </Button>
          {ids.length > 1 && (
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={current === 0} onClick={() => step(-1)}><IconChevronLeft />Previous</Button>
              <Button type="button" variant="outline" size="sm" disabled={current === ids.length - 1} onClick={() => step(1)}>Next<IconChevronRight /></Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
