"use client";

import { cn } from "@/lib/utils";
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export type CardChoice<T extends string> = { value: T; title: React.ReactNode; description?: React.ReactNode; trailing?: React.ReactNode };

type Props<T extends string> = {
  name: string;
  label: string;
  value: T;
  options: CardChoice<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
};

/** Selectable cards backed by a radio group; the radio dot is hidden and the card shows the state. */
export function ChoiceCards<T extends string>({ name, label, value, options, onChange, disabled, className }: Props<T>) {
  return (
    <RadioGroup value={value} onValueChange={(next) => onChange(next as T)} aria-label={label} disabled={disabled}
      className={cn("grid gap-2 sm:grid-cols-2", className)}>
      {options.map((option) => (
        <FieldLabel key={option.value} htmlFor={`${name}-${option.value}`}>
          <Field orientation="horizontal">
            <RadioGroupItem value={option.value} id={`${name}-${option.value}`} className="sr-only size-px" />
            <FieldContent>
              <FieldTitle className="w-full">{option.title}</FieldTitle>
              {option.description && <FieldDescription>{option.description}</FieldDescription>}
            </FieldContent>
            {option.trailing}
          </Field>
        </FieldLabel>
      ))}
    </RadioGroup>
  );
}
