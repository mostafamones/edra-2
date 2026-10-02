"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Props = {
  id: string;
  /** ISO date, "YYYY-MM-DD", or blank. */
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  invalid?: boolean;
  disabled?: boolean;
  "aria-describedby"?: string;
};

/** Calendar-in-popover date picker that stores an ISO date string. */
export function DatePicker({ id, value, onChange, min, max, invalid, disabled, ...props }: Props) {
  const [open, setOpen] = useState(false);
  const selected = value ? parseISO(value) : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" disabled={disabled} aria-invalid={invalid || undefined}
          aria-describedby={props["aria-describedby"]}
          className={cn("w-full justify-start font-normal aria-invalid:border-destructive", !selected && "text-muted-foreground")}>
          <CalendarIcon className="text-muted-foreground" />
          {selected ? format(selected, "EEE, MMM d, yyyy") : "Pick a date"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? (min ? parseISO(min) : undefined)}
          onSelect={(date) => { if (date) { onChange(format(date, "yyyy-MM-dd")); setOpen(false); } }}
          disabled={[...(min ? [{ before: parseISO(min) }] : []), ...(max ? [{ after: parseISO(max) }] : [])]}
        />
      </PopoverContent>
    </Popover>
  );
}
