"use client";

import { Controller, useFormContext, useWatch } from "react-hook-form";

import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { MAX_TIME_LIMIT, type QuizFormValues } from "../../validation";

/** The optional individual time limit: the switch, with the minutes beside it once it is on. */
export function TimerFields({ disabled }: { disabled: boolean }) {
  const { control, register, formState: { errors } } = useFormContext<QuizFormValues>();
  const timed = useWatch({ control, name: "timed" });
  return (
    <Field data-invalid={Boolean(errors.timeLimit) || undefined}>
      <div className="flex items-center gap-3">
        <Controller control={control} name="timed" render={({ field }) => (
          <Switch id="quiz-timed" checked={field.value} disabled={disabled} onCheckedChange={field.onChange} />
        )} />
        <FieldLabel htmlFor="quiz-timed">Individual time limit</FieldLabel>
        {timed && (
          <div className="ml-auto flex items-center gap-2">
            <Input id="quiz-time-limit" type="number" min={1} max={MAX_TIME_LIMIT} inputMode="numeric" readOnly={disabled} aria-label="Minutes" className="w-24"
              aria-invalid={Boolean(errors.timeLimit) || undefined} {...register("timeLimit")} />
            <span className="text-sm text-muted-foreground">min</span>
          </div>
        )}
      </div>
      <FieldError>{errors.timeLimit?.message}</FieldError>
    </Field>
  );
}
