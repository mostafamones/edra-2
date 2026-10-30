"use client";

import { PALETTE, PALETTE_KEYS, type PaletteKey } from "@/lib/palette";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LabelSwatch } from "./badge";

/** A dot inside its field (a `relative` wrapper around an input with `pl-8`) that picks a named palette entry; the selected one is checked and named, not shown by color alone. */
export function LabelColorPicker({ value, onChange, label, disabled }: { value: PaletteKey; onChange: (color: PaletteKey) => void; label: string; disabled?: boolean }) {
  return (
    <DropdownMenu modal={false}>
      <Tooltip delayDuration={500}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon-xs" className="absolute top-1 left-1" disabled={disabled} aria-label={`${label}: ${PALETTE[value].name}`}>
              <LabelSwatch color={value} className="size-3" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}: {PALETTE[value].name}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="min-w-36">
        <DropdownMenuRadioGroup value={value} onValueChange={(next) => onChange(next as PaletteKey)}>
          {PALETTE_KEYS.map((key) => (
            <DropdownMenuRadioItem key={key} value={key}>
              <LabelSwatch color={key} className="size-3" />{PALETTE[key].name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
