"use client";

import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Label } from "../types";
import { LabelBadge, LabelBadges } from "./badge";

/** A card's labels on one line; when they don't fit, the first stays whole and the rest collapse into a +N with their badges in a tooltip. */
export function LabelOverflow({ labels, className }: { labels: readonly Label[]; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const full = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  // Labels can arrive after the first render, and nothing is mounted to measure until they do.
  const hasLabels = labels.length > 0;

  useEffect(() => {
    if (!root.current || !full.current) return;
    const [available, needed] = [root.current, full.current];
    const observer = new ResizeObserver(() => setOverflowing(needed.offsetWidth > available.clientWidth));
    observer.observe(available);
    observer.observe(needed);
    return () => observer.disconnect();
  }, [hasLabels]);

  if (!hasLabels) return null;
  const [first, ...rest] = labels;
  return (
    <div ref={root} className={cn("relative min-w-0 flex-1 basis-0", className)}>
      {/* The whole row at full width, kept out of layout, so the badges can return when it fits again. */}
      <div aria-hidden="true" className="invisible absolute h-0 w-0 overflow-hidden">
        <div ref={full} className="flex w-max gap-1">{labels.map((label) => <LabelBadge key={label.id} label={label} />)}</div>
      </div>
      {overflowing && rest.length > 0 ? (
        <div className="flex items-center gap-1">
          <div className="flex min-w-0"><LabelBadge label={first} /></div>
          <Tooltip delayDuration={500}>
            {/* Above the stretched link so it can be hovered. */}
            <TooltipTrigger asChild>
              <Badge variant="secondary" tabIndex={0} className="relative z-10 cursor-default font-normal">
                <span aria-hidden="true">+{rest.length}</span>
                <span className="sr-only">{rest.map((label) => label.name).join(", ")}</span>
              </Badge>
            </TooltipTrigger>
            {/* The popover surface, not the inverted tooltip one, so the badges keep the colors they have on the card. */}
            <TooltipContent className="max-w-none bg-popover px-1.5 text-popover-foreground shadow-md ring-1 ring-foreground/10 [&_svg]:bg-popover [&_svg]:fill-popover">
              <LabelBadges labels={rest} className="flex-col flex-nowrap items-start" />
            </TooltipContent>
          </Tooltip>
        </div>
      ) : (
        <LabelBadges labels={labels} className="flex-nowrap" />
      )}
    </div>
  );
}
