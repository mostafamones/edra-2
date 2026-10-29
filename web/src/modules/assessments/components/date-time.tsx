"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, ArrowLeft01Icon, ArrowRight01Icon, Calendar03Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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
  const clock = /^\d{2}:\d{2}$/.test(time) && date ? format(parseISO(`${date}T${time}`), "h:mm a") : "";

  return (
    <Popover open={open && !disabled} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" disabled={disabled} aria-invalid={invalid || undefined}
          className="w-full justify-start font-normal">
          <HugeiconsIcon icon={Calendar03Icon} strokeWidth={1.5} className="text-muted-foreground" aria-hidden="true" />
          {selected ? <>{format(selected, "d MMM yyyy")}{clock && <span className="ml-auto text-muted-foreground">{clock}</span>}</> : <span className="text-muted-foreground">Not set</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto gap-0 p-0" aria-label={`${label} picker`}>
        <Calendar mode="single" required selected={selected} defaultMonth={selected} autoFocus captionLayout="dropdown"
          startMonth={new Date(2000, 0)} endMonth={new Date(2100, 11)} components={{ Chevron: CalendarChevron }}
          onSelect={(next) => { if (next) onChange(`${format(next, "yyyy-MM-dd")}T${time || defaultTime}`); }} />
        <div className="space-y-3 border-t p-3">
          <Field orientation="horizontal">
            <FieldLabel htmlFor={`${id}-time`}>Time</FieldLabel>
            <Input id={`${id}-time`} type="time" aria-label={`${label} time`} className="w-32 tabular-nums" step={60}
              disabled={!selected} value={time} onChange={(event) => onChange(`${date}T${event.target.value}`)} />
          </Field>
          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={!value} onClick={() => { onChange(""); setOpen(false); }}>Clear</Button>
            <Button type="button" size="sm" onClick={() => setOpen(false)}>Done</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CalendarChevron({ className, orientation }: { className?: string; orientation?: string }) {
  return <HugeiconsIcon icon={orientation === "left" ? ArrowLeft01Icon : orientation === "right" ? ArrowRight01Icon : ArrowDown01Icon}
    strokeWidth={1.5} className={`size-4 ${className ?? ""}`} aria-hidden="true" />;
}
