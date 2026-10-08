"use client";

import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { cn } from "cn";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type Choice<T extends string> = { value: T; label: string; hint?: string };

type Props<T extends string> = {
  label: string;
  value: T;
  options: Choice<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  /** Stretch to the container width with equally sized segments. */
  fill?: boolean;
  /** Draw a border around the switch. */
  bordered?: boolean;
  className?: string;
};

/** A compact two-way switch for mutually exclusive choices; the selected segment is highlighted. */
export function Segmented<T extends string>({ label, value, options, onChange, disabled, fill, bordered, className }: Props<T>) {
  return (
    <RadioGroupPrimitive.Root value={value} onValueChange={(next) => onChange(next as T)} aria-label={label} disabled={disabled}
      className={cn("inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5", bordered && "border", fill ? "flex w-full" : "w-fit", className)}>
      {options.map((option) => {
        const item = (
          <RadioGroupPrimitive.Item value={option.value}
            className={cn("rounded-md px-3 py-1 text-sm font-medium text-muted-foreground transition-all outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 aria-checked:bg-background aria-checked:text-foreground aria-checked:shadow-sm", fill && "flex-1")}>
            {option.label}
          </RadioGroupPrimitive.Item>
        );
        if (!option.hint) return <span key={option.value} className={fill ? "flex flex-1" : undefined}>{item}</span>;
        return (
          <Tooltip key={option.value}>
            <TooltipTrigger asChild>{item}</TooltipTrigger>
            <TooltipContent>{option.hint}</TooltipContent>
          </Tooltip>
        );
      })}
    </RadioGroupPrimitive.Root>
  );
}
