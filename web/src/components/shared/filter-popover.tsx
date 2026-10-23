"use client";

import { Fragment, useRef, useState, type ReactNode } from "react";

import { Segmented } from "@/components/shared/segmented";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, FilterIcon } from "@hugeicons/core-free-icons";

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
                    <HugeiconsIcon icon={FilterIcon} />
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
                <HugeiconsIcon icon={FilterIcon} />Filter
                {active > 0 && <Badge variant="secondary" className="px-1.5">{active}</Badge>}
              </Button>
            </PopoverTrigger>
            {children}
          </div>
        )}
      </PopoverAnchor>
      <PopoverContent align="end" className="w-72 gap-3 font-(family-name:--font-figtree)">
        <div className="flex items-center justify-between mb-2">
          <p className="font-(family-name:--font-poppins) text-sm font-semibold">Filters</p>
          <Button variant="ghost" size="sm" className="-mr-2 h-7 text-muted-foreground" disabled={active === 0}
            onClick={() => { for (const field of fields) field.onChange(field.defaultValue); }}>
            <HugeiconsIcon icon={Cancel01Icon} />Reset
          </Button>
        </div>
        <FieldGroup className="gap-2">
          {fields.filter((field) => !field.toggleLabel).map((field) => (
            <Field key={field.id} orientation="horizontal" className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-3">
              <FieldLabel htmlFor={`filter-${field.id}`} className="text-xs text-muted-foreground">{field.label}</FieldLabel>
              <FilterSelect field={field} />
            </Field>
          ))}
        </FieldGroup>
        {fields.filter((field) => field.toggleLabel).map((field) => {
          const other = field.options.find((option) => option.value !== field.defaultValue);
          const first = field.options.find((option) => option.value === field.defaultValue);
          if (!other || !first) return null;
          return (
            <Fragment key={field.id}>
              <Separator />
              <Segmented fill label={field.label} value={field.value === other.value ? other.value : first.value}
                options={[first, other]} onChange={field.onChange} />
            </Fragment>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

/** A select whose value truncates; hovering shows the whole value, but only when it is cut off. */
function FilterSelect({ field }: { field: FilterField }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const selected = field.options.find((option) => option.value === field.value)?.label;
  const cutOff = () => {
    const value = trigger.current?.querySelector<HTMLElement>("[data-slot=select-value]");
    return !!value && value.scrollWidth > value.clientWidth;
  };
  return (
    <Select value={field.value} onValueChange={field.onChange}>
      <Tooltip delayDuration={400} open={open} onOpenChange={(next) => setOpen(next && cutOff())}>
        <TooltipTrigger asChild>
          <SelectTrigger ref={trigger} id={`filter-${field.id}`} className="h-8 w-full min-w-0 border-transparent bg-muted/60 shadow-none hover:bg-muted dark:bg-muted/40 dark:hover:bg-muted">
            <SelectValue className="block! min-w-0 flex-1 truncate text-left" />
          </SelectTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{selected}</TooltipContent>
      </Tooltip>
      <SelectContent>
        {field.options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
