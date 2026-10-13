"use client";

import { Controller, useFieldArray, useFormContext } from "react-hook-form";

import { IconPlus, IconTrash } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { FieldError, FieldLabel } from "@/components/ui/field";
import { MAX_SESSIONS, type ScheduleFormValues } from "../validation";
import { DatePicker } from "./date-picker";
import { TimeSelect } from "./time-select";

const NEW_SESSION = { date: "", startsAt: "", endsAt: "" };
const ROW = "grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_2.25rem] items-start gap-2";

type Props = { minDate: string; maxDate: string; disabled?: boolean };

/** Dated sessions for a one-off schedule: 1–50 rows in one card, each a date with start and end times. */
export function SessionFields({ minDate, maxDate, disabled }: Props) {
  const { control, formState: { errors } } = useFormContext<ScheduleFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "sessions" });
  const listError = errors.sessions?.root?.message ?? errors.sessions?.message;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-base font-medium">Sessions</h4>
        <Button type="button" variant="outline" size="sm" onClick={() => append({ ...NEW_SESSION })}
          disabled={disabled || fields.length >= MAX_SESSIONS}>
          <IconPlus />Add session
        </Button>
      </div>
      <div className="flex flex-col gap-3 rounded-md border bg-card p-3">
        <div className={ROW} aria-hidden="true">
          <FieldLabel>Date</FieldLabel>
          <FieldLabel>Starts</FieldLabel>
          <FieldLabel>Ends</FieldLabel>
          <span />
        </div>
        {fields.map((field, index) => {
          const rowErrors = errors.sessions?.[index];
          const label = `Session ${index + 1}`;
          const dateMessage = rowErrors?.date?.message;
          const dateId = `session-${field.id}-date`;
          return (
            <fieldset key={field.id} className="min-w-0">
              <legend className="sr-only">{label}</legend>
              <div className={ROW}>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Controller
                    control={control}
                    name={`sessions.${index}.date`}
                    render={({ field: date }) => (
                      <DatePicker id={dateId} value={date.value} onChange={date.onChange} min={minDate} max={maxDate}
                        invalid={Boolean(dateMessage)} disabled={disabled}
                        aria-describedby={dateMessage ? `${dateId}-error` : undefined} />
                    )}
                  />
                  <FieldError id={`${dateId}-error`}>{dateMessage}</FieldError>
                </div>
                {(["startsAt", "endsAt"] as const).map((key) => {
                  const id = `session-${field.id}-${key}`;
                  const message = rowErrors?.[key]?.message;
                  return (
                    <div key={key} className="flex min-w-0 flex-col gap-1.5">
                      <Controller
                        control={control}
                        name={`sessions.${index}.${key}`}
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
                  title={fields.length === 1 ? "A one-off schedule needs at least one session" : undefined}>
                  <IconTrash />
                </Button>
              </div>
            </fieldset>
          );
        })}
      </div>
      {listError && <FieldError>{listError}</FieldError>}
      {fields.length >= MAX_SESSIONS && (
        <p className="text-xs text-muted-foreground">One-off schedules can have up to {MAX_SESSIONS} sessions.</p>
      )}
    </div>
  );
}
