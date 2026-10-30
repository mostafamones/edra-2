"use client";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { IconArrowsSort } from "@tabler/icons-react";

export type SortOption = { value: string; label: string };

/** An icon button opening a panel with one select of sort orders; `defaultValue` is what Reset restores. */
export function SortPopover({ value, defaultValue, options, onChange }: {
  value: string; defaultValue: string; options: SortOption[]; onChange: (value: string) => void;
}) {
  const active = value !== defaultValue;
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" className="relative" aria-label={active ? "Sort, changed" : "Sort"}>
              <IconArrowsSort />
              {active && <span aria-hidden="true" className="absolute top-1 right-1 size-1.5 rounded-full bg-primary" />}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Sort</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-72">
        <div className="flex items-center justify-between">
          <p className="font-medium">Sort</p>
          <Button variant="ghost" size="sm" className="-mr-2 h-7" disabled={!active} onClick={() => onChange(defaultValue)}>Reset</Button>
        </div>
        <Field>
          <FieldLabel htmlFor="sort-order">Order by</FieldLabel>
          <Select value={value} onValueChange={onChange}>
            <SelectTrigger id="sort-order" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </PopoverContent>
    </Popover>
  );
}
