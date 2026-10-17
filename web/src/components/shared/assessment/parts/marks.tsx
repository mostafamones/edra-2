"use client";

import { Controller, useFormContext, type FieldValues } from "react-hook-form";

import { NumberInput } from "@/components/shared/app-input";

/** A marks stepper; the column header names it in a sheet, a label names it on a question card. */
export function MarksInput({ partIndex, index, noun, small, disabled }: { partIndex: number; index: number; noun: string; small?: boolean; disabled?: boolean }) {
  const { control } = useFormContext<FieldValues>();
  return (
    <Controller control={control} name={`parts.${partIndex}.questions.${index}.maxScore`}
      render={({ field, fieldState }) => (
        <NumberInput containerClassName={small ? "w-32 shrink-0" : "w-36 shrink-0"} variant={small ? "md" : undefined}
          className="text-center tabular-nums" min={0} max={1000} step={0.5} disabled={disabled}
          aria-label={`Marks for ${noun} ${index + 1}`} aria-invalid={fieldState.invalid || undefined} autoComplete="off"
          name={field.name} ref={field.ref} value={field.value} onBlur={field.onBlur}
          onChange={(event) => field.onChange(event.target.value)} />
      )} />
  );
}
