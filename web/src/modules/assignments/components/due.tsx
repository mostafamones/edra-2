"use client";

import { useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { format, parseISO } from "date-fns";
import { IconCalendar } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Field, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { AssignmentFormValues } from "../validation";

/** The advisory due date; the time is always 11:59 PM academy time. Nothing is rejected because of it. */
export function DueFields() {
  const { control, setValue } = useFormContext<AssignmentFormValues>();
  const [open, setOpen] = useState(false);

  return (
    <Field>
      <FieldLabel htmlFor="assignment-due-date">Due date</FieldLabel>
      <Controller
        control={control}
        name="dueDate"
        render={({ field }) => {
          const selected = field.value ? parseISO(field.value) : undefined;
          return (
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button id="assignment-due-date" type="button" variant="outline"
                  className={cn("w-full justify-start font-normal", !selected && "text-muted-foreground")}>
                  <IconCalendar className="text-muted-foreground" />
                  {selected ? format(selected, "MMM d, yyyy") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-0">
                <Calendar mode="single" selected={selected} defaultMonth={selected}
                  onSelect={(date) => {
                    if (!date) return;
                    // Work is due at the end of the day.
                    setValue("dueTime", "23:59", { shouldDirty: true });
                    field.onChange(format(date, "yyyy-MM-dd"));
                    setOpen(false);
                  }} />
              </PopoverContent>
            </Popover>
          );
        }}
      />
    </Field>
  );
}
