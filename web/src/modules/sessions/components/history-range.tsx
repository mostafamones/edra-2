"use client";

import { useState } from "react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { IconCalendar } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** "Oct 1 – Oct 5, 2026", or one day when the range is a single day. */
export function describeRange(range: DateRange | undefined) {
  if (!range?.from) return "Filter by date range";
  const last = range.to ?? range.from;
  return range.from.getTime() === last.getTime()
    ? format(range.from, "MMM d, yyyy")
    : `${format(range.from, "MMM d")} – ${format(last, "MMM d, yyyy")}`;
}

/** Icon-only calendar button; the tooltip shows the selected range. */
export function HistoryRange({ value, onChange }: { value: DateRange | undefined; onChange: (range: DateRange | undefined) => void }) {
  const [open, setOpen] = useState(false);
  const active = Boolean(value?.from);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip delayDuration={600}>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant={active ? "secondary" : "outline"} size="icon" aria-label={describeRange(value)}>
              <IconCalendar className={active ? "" : "text-muted-foreground"} />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{describeRange(value)}</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar mode="range" selected={value} onSelect={onChange} numberOfMonths={1} defaultMonth={value?.from} />
        {active && (
          <div className="border-t border-border p-2">
            <Button variant="ghost" size="sm" className="w-full" onClick={() => { onChange(undefined); setOpen(false); }}>Clear dates</Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
