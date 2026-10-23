"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { cn } from "cn";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type Choice<T extends string> = { value: T; label: ReactNode; hint?: string };

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

/** A compact switch for mutually exclusive choices; a pill slides under the selected segment. */
export function Segmented<T extends string>({ label, value, options, onChange, disabled, fill, className }: Props<T>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);

  // Measure the checked segment so the pill follows it, including when labels or the container resize.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const place = () => {
      const item = root.querySelector<HTMLElement>("[role=radio][data-state=checked]");
      setThumb(item ? { left: item.offsetLeft, width: item.offsetWidth } : null);
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(root);
    return () => observer.disconnect();
  }, [value, options]);

  return (
    <RadioGroupPrimitive.Root ref={rootRef} value={value} onValueChange={(next) => onChange(next as T)} aria-label={label} disabled={disabled}
      className={cn("relative inline-flex h-8 items-center rounded-lg bg-muted/70 p-0.5 dark:bg-muted/40", fill ? "flex w-full" : "w-fit", className)}>
      {thumb && (
        <span aria-hidden="true" style={{ left: thumb.left, width: thumb.width }}
          className="pointer-events-none absolute inset-y-0.5 rounded-md bg-background shadow-xs transition-[left,width] duration-200 ease-out motion-reduce:transition-none dark:bg-input/60" />
      )}
      {options.map((option) => {
        const item = (
          <RadioGroupPrimitive.Item value={option.value} aria-label={option.hint}
            className={cn("relative flex h-full items-center justify-center rounded-md px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-checked:text-foreground", fill && "flex-1")}>
            {option.label}
          </RadioGroupPrimitive.Item>
        );
        if (!option.hint) return <span key={option.value} className={cn("flex h-full", fill && "flex-1")}>{item}</span>;
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
