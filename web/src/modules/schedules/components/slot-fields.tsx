"use client";

import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FieldError, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WEEK_ORDER, weekdayName } from "../time";
import { MAX_WEEKLY_SLOTS, type ScheduleFormValues } from "../validation";
import { TimeSelect } from "./time-select";

const NEW_SLOT = { weekday: 6, startsAt: "", endsAt: "" };
const ROW = "grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_2.25rem] items-start gap-2";

/** Weekly slots for a recurring schedule: 1–20 rows in one card, each a weekday with start and end times. */
export function SlotFields({ disabled }: { disabled?: boolean }) {
  const { control, formState: { errors } } = useFormContext<ScheduleFormValues>();
  // useFieldArray gives every row a stable id, so removing a row never shifts another row's state.
  const { fields, append, remove } = useFieldArray({ control, name: "slots" });
  const listError = errors.slots?.root?.message ?? errors.slots?.message;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-base font-medium">Time slots</h4>
        <Button type="button" variant="outline" size="sm" onClick={() => append({ ...NEW_SLOT })}
          disabled={disabled || fields.length >= MAX_WEEKLY_SLOTS}>
          <Plus />Add slot
        </Button>
      </div>
      <div className="flex flex-col gap-3 rounded-md border bg-card p-3">
        <div className={ROW} aria-hidden="true">
          <FieldLabel>Day</FieldLabel>
          <FieldLabel>Starts</FieldLabel>
          <FieldLabel>Ends</FieldLabel>
          <span />
        </div>
        {fields.map((field, index) => {
          const slotErrors = errors.slots?.[index];
          const label = `Slot ${index + 1}`;
          return (
            <fieldset key={field.id} className="min-w-0">
              <legend className="sr-only">{label}</legend>
              <div className={ROW}>
                <Controller
                  control={control}
                  name={`slots.${index}.weekday`}
                  render={({ field: day }) => (
                    <Select value={String(day.value)} onValueChange={(value) => day.onChange(Number(value))} disabled={disabled}>
                      <SelectTrigger aria-label={`${label} day`} className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {WEEK_ORDER.map((weekday) => <SelectItem key={weekday} value={String(weekday)}>{weekdayName(weekday)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                />
                {(["startsAt", "endsAt"] as const).map((key) => {
                  const id = `slot-${field.id}-${key}`;
                  const message = slotErrors?.[key]?.message;
                  return (
                    <div key={key} className="flex min-w-0 flex-col gap-1.5">
                      <Controller
                        control={control}
                        name={`slots.${index}.${key}`}
                        render={({ field: time }) => (
                          <TimeSelect id={id} value={time.value} onChange={time.onChange} invalid={Boolean(message)}
                            disabled={disabled} aria-describedby={message ? `${id}-error` : undefined} />
                        )}
                      />
                      <FieldError id={`${id}-error`}>{message}</FieldError>
                    </div>
                  );
                })}
                <Button type="button" variant="ghost" size="icon" className="text-muted-foreground"
                  onClick={() => remove(index)} disabled={disabled || fields.length === 1}
                  aria-label={`Remove ${label.toLowerCase()}`}
                  title={fields.length === 1 ? "A recurring schedule needs at least one slot" : undefined}>
                  <Trash2 />
                </Button>
              </div>
            </fieldset>
          );
        })}
      </div>
      {listError && <FieldError>{listError}</FieldError>}
      {fields.length >= MAX_WEEKLY_SLOTS && (
        <p className="text-xs text-muted-foreground">Recurring schedules can have up to {MAX_WEEKLY_SLOTS} weekly slots.</p>
      )}
    </div>
  );
}
