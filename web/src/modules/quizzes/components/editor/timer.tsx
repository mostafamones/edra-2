"use client";

import { Controller, useFormContext, useWatch } from "react-hook-form";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { MAX_TIME_LIMIT, type QuizFormValues } from "../../validation";

/** The optional individual time limit; the window itself is set on the quiz page. */
export function TimerFields({ disabled }: { disabled: boolean }) {
  const { control, register, formState: { errors } } = useFormContext<QuizFormValues>();
  const timed = useWatch({ control, name: "timed" });
  return (
    <>
      <Field orientation="horizontal">
        <Controller control={control} name="timed" render={({ field }) => (
          <Switch id="quiz-timed" checked={field.value} disabled={disabled} onCheckedChange={field.onChange} />
        )} />
        <FieldLabel htmlFor="quiz-timed">Individual time limit</FieldLabel>
      </Field>
      {timed && (
        <Field data-invalid={Boolean(errors.timeLimit) || undefined} className="max-w-48">
          <FieldLabel htmlFor="quiz-time-limit">Minutes</FieldLabel>
          <Input id="quiz-time-limit" type="number" min={1} max={MAX_TIME_LIMIT} inputMode="numeric" readOnly={disabled}
            aria-invalid={Boolean(errors.timeLimit) || undefined} {...register("timeLimit")} />
          <FieldError>{errors.timeLimit?.message}</FieldError>
        </Field>
      )}
      <FieldDescription>
        Each online attempt ends at the earlier of its own deadline and the window’s actual closure, two minutes after the scheduled close. Owners, Head Admins and Admins set the window on the quiz page.
      </FieldDescription>
    </>
  );
}
