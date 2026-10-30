"use client";

import { useMemo, useRef } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Tag01Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LabelEditor } from "./editor";

type Props = {
  academyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The element that opened the editor from elsewhere (such as a row's context menu): the editor sits beside it and focus returns to it. */
  opener: HTMLElement | null;
  onChanged?: () => void;
};

/** The label icon button and its editor popover. Render it only for label managers. */
export function LabelManager({ academyId, open, onOpenChange, opener, onChanged }: Props) {
  const button = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const target = () => (opener?.isConnected ? opener : button.current);
  // A virtual anchor follows the row that opened the editor; an empty rect there falls back to the toolbar button.
  const anchor = useMemo(() => ({ current: { getBoundingClientRect: () => {
      const rect = opener?.isConnected ? opener.getBoundingClientRect() : null;
      return rect && (rect.width || rect.height) ? rect : button.current?.getBoundingClientRect() ?? new DOMRect();
    } } }),
    [opener]);
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {opener && <PopoverAnchor virtualRef={anchor} />}
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button ref={button} variant="outline" size="icon" aria-label="Manage labels">
              <HugeiconsIcon icon={Tag01Icon} strokeWidth={1.5} aria-hidden="true" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Labels</TooltipContent>
      </Tooltip>
      <PopoverContent ref={content} align="end" aria-label="Labels" className="w-80"
        // Start in the new-label field rather than on a control whose tooltip would take the first Escape.
        onOpenAutoFocus={(event) => { event.preventDefault(); content.current?.querySelector<HTMLInputElement>("input[data-new-label]")?.focus(); }}
        onCloseAutoFocus={(event) => { event.preventDefault(); target()?.focus({ preventScroll: true }); }}>
        <LabelEditor academyId={academyId} onChanged={onChanged} />
      </PopoverContent>
    </Popover>
  );
}
