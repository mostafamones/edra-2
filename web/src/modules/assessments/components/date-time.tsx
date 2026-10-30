"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, ArrowLeft01Icon, ArrowRight01Icon, Calendar03Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TimeSelect } from "@/modules/schedules";

type Props = {
  id: string;
  label: string;
  /** Cairo wall time, YYYY-MM-DDTHH:mm, or blank. */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  defaultTime?: string;
};

export function AssessmentDateTime({ id, label, value, onChange, disabled, invalid, defaultTime = "12:00" }: Props) {
  const [open, setOpen] = useState(false);
  const [date, time = defaultTime] = value.split("T");
  const selected = date ? parseISO(date) : undefined;

  return (
    <div className="flex gap-2">
      <Popover open={open && !disabled} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" disabled={disabled} aria-invalid={invalid || undefined}
            className="min-w-0 flex-1 justify-start font-normal">
            <HugeiconsIcon icon={Calendar03Icon} strokeWidth={1.5} className="text-muted-foreground" aria-hidden="true" />
            {selected ? format(selected, "d MMM yyyy") : <span className="text-muted-foreground">Not set</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto gap-0 p-0" aria-label={`${label} picker`}>
          <Calendar mode="single" required selected={selected} defaultMonth={selected} autoFocus captionLayout="dropdown"
            startMonth={new Date(2000, 0)} endMonth={new Date(2100, 11)} components={{ Chevron: CalendarChevron }}
            onSelect={(next) => { if (next) { onChange(`${format(next, "yyyy-MM-dd")}T${time || defaultTime}`); setOpen(false); } }} />
          {value && (
            <div className="border-t p-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => { onChange(""); setOpen(false); }}>Clear</Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
      <div className="w-36 shrink-0">
        <TimeSelect id={`${id}-time`} aria-label={`${label} time`} disabled={disabled || !selected} invalid={invalid}
          value={selected ? time : ""} onChange={(next) => onChange(`${date}T${next}`)} />
      </div>
    </div>
  );
}

function CalendarChevron({ className, orientation }: { className?: string; orientation?: string }) {
  return <HugeiconsIcon icon={orientation === "left" ? ArrowLeft01Icon : orientation === "right" ? ArrowRight01Icon : ArrowDown01Icon}
    strokeWidth={1.5} className={`size-4 ${className ?? ""}`} aria-hidden="true" />;
}
