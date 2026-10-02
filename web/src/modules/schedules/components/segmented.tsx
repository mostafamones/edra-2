"use client";

import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { cn } from "cn";

export type Choice<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  label: string;
  value: T;
  options: Choice<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  /** Stretch to the container width with equally sized segments. */
  fill?: boolean;
  className?: string;
};

/** A compact two-way switch for mutually exclusive choices; the selected segment is highlighted. */
export function Segmented<T extends string>({ label, value, options, onChange, disabled, fill, className }: Props<T>) {
  return (
    <RadioGroupPrimitive.Root value={value} onValueChange={(next) => onChange(next as T)} aria-label={label} disabled={disabled}
      className={cn("inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5", fill ? "flex w-full" : "w-fit", className)}>
      {options.map((option) => (
        <RadioGroupPrimitive.Item key={option.value} value={option.value}
          className={cn("rounded-md px-3 py-1 text-sm font-medium text-muted-foreground transition-all outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 data-[state=checked]:bg-background data-[state=checked]:text-foreground data-[state=checked]:shadow-sm", fill && "flex-1")}>
          {option.label}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}
