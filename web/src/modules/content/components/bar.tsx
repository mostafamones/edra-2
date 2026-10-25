"use client";
import { useRef } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, ArrowUp01Icon, Attachment01Icon, Cancel01Icon, Delete02Icon, Unlink04Icon, Upload04Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { DOCUMENT_TYPES, type ContentItem } from "../types";

/** Controls for the selected material, pinned to the viewport bottom like the students bulk bar. Arrow keys also move it. */
export function MaterialBar({ item, label, first, last, child, onMove, onFile, onUnlink, onRemove, onClear }: {
  item: ContentItem; label: string; first: boolean; last: boolean; child: boolean;
  onMove: (delta: -1 | 1) => void; onFile: (file: File) => void; onUnlink: () => void; onRemove: () => void; onClear: () => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  // Assessments take an answer video or document; explanation videos take attached documents.
  const adds = item.kind === "assessment" ? { label: "Add answer", icon: Upload04Icon, accept: ["video/*", ...DOCUMENT_TYPES] }
    : item.kind === "explanation" ? { label: "Attach document", icon: Attachment01Icon, accept: DOCUMENT_TYPES } : null;
  return <div role="region" aria-label="Selected material" data-material-bar=""
    className="fixed bottom-6 left-1/2 z-40 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center gap-1 rounded-lg border bg-popover p-1.5 text-sm shadow-lg animate-in fade-in slide-in-from-bottom-2">
    <span className="flex min-w-0 max-w-56 flex-col px-2 leading-tight" aria-live="polite">
      <span dir="auto" className="truncate font-medium">{item.title || "Untitled"}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </span>
    <Separator orientation="vertical" className="mx-1 h-5! self-center!" />
    <Button variant="ghost" size="icon-sm" aria-label="Move up" title="Move up (↑)" disabled={first} onClick={() => onMove(-1)}><HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={1.5} /></Button>
    <Button variant="ghost" size="icon-sm" aria-label="Move down" title="Move down (↓)" disabled={last} onClick={() => onMove(1)}><HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={1.5} /></Button>
    {adds && <>
      <Button variant="ghost" size="sm" onClick={() => picker.current?.click()}><HugeiconsIcon icon={adds.icon} strokeWidth={1.5} />{adds.label}</Button>
      <input ref={picker} type="file" className="sr-only" tabIndex={-1} aria-hidden="true" accept={adds.accept.join(",")} onChange={event => { const file = event.target.files?.[0]; if (file) onFile(file); event.target.value = ""; }} />
    </>}
    {child && <Button variant="ghost" size="sm" onClick={onUnlink}><HugeiconsIcon icon={Unlink04Icon} strokeWidth={1.5} />Detach</Button>}
    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={onRemove}><HugeiconsIcon icon={Delete02Icon} strokeWidth={1.5} />Remove</Button>
    <Button variant="ghost" size="icon-sm" onClick={onClear} aria-label="Clear selection"><HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.5} /></Button>
  </div>;
}
