"use client";

import { useFormContext } from "react-hook-form";

import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MAX_TIME_LIMIT, type ExamFormValues } from "../../validation";

/** The individual timer every exam needs before it is ready; the window itself is set on the exam page. */
export function TimerFields({ disabled }: { disabled: boolean }) {
  const { register, formState: { errors } } = useFormContext<ExamFormValues>();
  return (
    <>
      <Field data-invalid={Boolean(errors.timeLimit) || undefined} className="max-w-48">
        <FieldLabel htmlFor="exam-time-limit">Minutes per attempt</FieldLabel>
        <Input id="exam-time-limit" type="number" min={1} max={MAX_TIME_LIMIT} inputMode="numeric" readOnly={disabled}
          aria-invalid={Boolean(errors.timeLimit) || undefined} {...register("timeLimit")} />
        <FieldError>{errors.timeLimit?.message}</FieldError>
      </Field>
    </>
  );
}
