"use client";

import { useRef, useState } from "react";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type UnitFact = { key: string; icon: IconSvgElement; label: string; rows: { title: string; answered?: boolean }[] };

/** A card's counts: hovering names one, clicking lists it. One popover stays open while moving between them; its content slides from the clicked side. */
export function UnitFacts({ facts }: { facts: UnitFact[] }) {
  // `index` outlives `open` so the list stays rendered through the closing animation.
  const [view, setView] = useState({ open: false, index: 0, slide: 0 });
  const anchor = useRef<HTMLDivElement>(null), opener = useRef<HTMLElement | null>(null);
  const shown = facts[view.index];
  function select(index: number, button: HTMLElement) {
    opener.current = button;
    setView(current => current.open && current.index === index ? { ...current, open: false } : { open: true, index, slide: current.open ? index - current.index : 0 });
  }
  return <Popover open={view.open && !!shown} onOpenChange={open => setView(current => ({ ...current, open }))}>
    <PopoverAnchor asChild>
      <div ref={anchor} className="flex items-center gap-x-0.5">
        {facts.map((fact, index) => <Tooltip key={fact.key} delayDuration={500}>
          <TooltipTrigger asChild>
            {/* Above the card's stretched link so it can be clicked. */}
            <Button variant="ghost" size="xs" aria-label={`${fact.label}: ${fact.rows.length}`} aria-haspopup="dialog" aria-expanded={view.open && view.index === index}
              className="relative z-10 px-1.5 font-normal tabular-nums text-muted-foreground hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground"
              onClick={event => select(index, event.currentTarget)}>
              <HugeiconsIcon icon={fact.icon} strokeWidth={1.5} className="size-3.5" aria-hidden="true" />{fact.rows.length}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{fact.label}</TooltipContent>
        </Tooltip>)}
      </div>
    </PopoverAnchor>
    {/* React events bubble out of the portal; keep right-clicks here from opening the card's menu. */}
    <PopoverContent align="start" aria-label={shown?.label} className="w-72 max-w-[calc(100vw-2rem)] gap-0 overflow-hidden p-1" onContextMenu={event => event.stopPropagation()}
      // The other counts switch the content; without this their press would dismiss the popover first.
      onInteractOutside={event => { if (anchor.current?.contains(event.target as Node)) event.preventDefault(); }}
      onEscapeKeyDown={() => opener.current?.focus()}>
      {shown && <div key={shown.key} className={cn("duration-200 motion-reduce:animate-none", view.slide > 0 && "animate-in fade-in-0 slide-in-from-right-6", view.slide < 0 && "animate-in fade-in-0 slide-in-from-left-6")}>
        <p className="px-2 py-1.5 text-xs text-muted-foreground">{shown.label}</p>
        <ul className="max-h-60 overflow-y-auto">
          {shown.rows.map((row, index) => <li key={index} className="flex items-center justify-between gap-3 px-2 py-1.5 text-sm">
            <span dir="auto" title={row.title} className="min-w-0 truncate">{row.title}</span>
            {row.answered !== undefined && <span className={cn("shrink-0 text-xs", row.answered ? "text-muted-foreground" : "text-destructive")}>{row.answered ? "Answered" : "Unanswered"}</span>}
          </li>)}
        </ul>
      </div>}
    </PopoverContent>
  </Popover>;
}
