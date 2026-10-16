"use client";

import type { ReactNode } from "react";
import { useFormContext } from "react-hook-form";

import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

/** Solution notes, released with the correct answers and model answers to qualifying students. */
export function SolutionsFields({ idPrefix, description }: { idPrefix: string; description: ReactNode }) {
  const { register } = useFormContext<{ solutionNotes: string }>();
  return (
    <Field>
      <FieldLabel htmlFor={`${idPrefix}-solutions`}>Solution notes <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel>
      <Textarea id={`${idPrefix}-solutions`} rows={3} maxLength={10000} {...register("solutionNotes")} />
      <FieldDescription>{description}</FieldDescription>
    </Field>
  );
}
