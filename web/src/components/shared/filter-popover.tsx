"use client";

import type { ReactNode } from "react";
import { ListFilter } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { IconCheck, IconFilter } from "@tabler/icons-react";

export type FilterField = {
  id: string;
  label: string;
  value: string;
  /** The value that means "not filtering"; it is what Reset restores. */
  defaultValue: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  /** Renders a toggle with this label for the non-default option, in place of a select. Pressed selects the first non-default option. */
  toggleLabel?: string;
};

/**
 * One Filter button opening a panel of labelled selects, with a count of the filters that are set.
 * `children` (such as a Create button) sit beside it, and the panel aligns to the right edge of the whole group.
 * With `iconOnly`, the trigger is an icon button and `children` join it in a button group; the caller places the group.
 */
export function FilterPopover({ fields, children, iconOnly = false }: { fields: FilterField[]; children?: ReactNode; iconOnly?: boolean }) {
  const active = fields.filter((field) => field.value !== field.defaultValue).length;
  return (
    <Popover>
      <PopoverAnchor asChild>
        {iconOnly ? (
          <ButtonGroup>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon" className="relative" aria-label={active > 0 ? `Filters, ${active} applied` : "Filters"}>
                    <IconFilter />
                    {active > 0 && (
                      <span aria-hidden="true" className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
                        {active}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>Filters</TooltipContent>
            </Tooltip>
            {children}
          </ButtonGroup>
        ) : (
          <div className="flex gap-2 sm:ml-auto">
            <PopoverTrigger asChild>
              <Button variant="outline" className="flex-1 sm:flex-none">
                <IconFilter />Filter
                {active > 0 && <Badge variant="secondary" className="px-1.5">{active}</Badge>}
              </Button>
            </PopoverTrigger>
            {children}
          </div>
        )}
      </PopoverAnchor>
      <PopoverContent align="end" className="w-72">
        <div className="flex items-center justify-between">
          <p className="font-medium">Filters</p>
          <Button variant="ghost" size="sm" className="-mr-2 h-7" disabled={active === 0}
            onClick={() => { for (const field of fields) field.onChange(field.defaultValue); }}>
            Reset
          </Button>
        </div>
        <FieldGroup className="gap-4">
          {fields.map((field) => {
            const other = field.toggleLabel ? field.options.find((option) => option.value !== field.defaultValue) : undefined;
            if (other) {
              return (
                <Toggle key={field.id} variant="outline" className="w-full justify-between" pressed={field.value === other.value}
                  onPressedChange={(pressed) => field.onChange(pressed ? other.value : field.defaultValue)}>
                  {field.toggleLabel}
                  {field.value === other.value && <IconCheck />}
                </Toggle>
              );
            }
            return (
              <Field key={field.id}>
                <FieldLabel htmlFor={`filter-${field.id}`}>{field.label}</FieldLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id={`filter-${field.id}`} className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {field.options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            );
          })}
        </FieldGroup>
      </PopoverContent>
    </Popover>
  );
}
