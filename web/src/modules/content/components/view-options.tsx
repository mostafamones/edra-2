"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, PreferenceHorizontalIcon } from "@hugeicons/core-free-icons";

import { ToggleBadge, ToggleBadgeGroup } from "@/components/shared/toggle-badge";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LabelFilter, type Label } from "@/modules/labels";
import { DEFAULT_UNIT_VIEW, STATE_LABELS, UNIT_STATUSES, type UnitView } from "../types";

const FIELDS = [
  { key: "group", id: "unit-view-group", label: "Group by", options: { none: "No grouping", program: "Program", status: "Status" } },
  { key: "sort", id: "unit-view-sort", label: "Order", options: { updated: "Recently updated", title: "Title" } },
] as const;
const SELECT = "h-8 w-full min-w-0 border-transparent bg-muted/60 shadow-none hover:bg-muted dark:bg-muted/40 dark:hover:bg-muted";

/** How the library arranges its cards: grouping, order, labels and, where a tab spans several, the statuses shown. */
export function UnitViewOptions({ view, showStatuses, labels, onChange }: { view: UnitView; showStatuses: boolean; labels: readonly Label[]; onChange: (view: UnitView) => void }) {
  const changed = view.group !== DEFAULT_UNIT_VIEW.group || view.sort !== DEFAULT_UNIT_VIEW.sort || view.statuses.length !== UNIT_STATUSES.length || view.labels.length > 0 || view.unlabeled;
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" className="relative" aria-label={changed ? "View options, changed" : "View options"}>
              <HugeiconsIcon icon={PreferenceHorizontalIcon} strokeWidth={1.5} />
              {changed && <span aria-hidden="true" className="absolute -top-1 -right-1 z-1 size-2.5 rounded-full bg-primary" />}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>View options</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-72 gap-3">
        <div className="mb-1 flex min-h-7 items-center justify-between">
          <p className="font-heading text-sm font-semibold">View options</p>
          {changed && (
            <Button variant="ghost" size="sm" className="-mr-2 h-7 text-muted-foreground"
              onClick={(event) => {
                // The button is about to disappear; keep focus inside the panel.
                event.currentTarget.closest<HTMLElement>("[data-slot=popover-content]")?.focus();
                onChange(DEFAULT_UNIT_VIEW);
              }}>
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.5} />Reset
            </Button>
          )}
        </div>
        <FieldGroup className="gap-2">
          {FIELDS.map((field) => (
            <Field key={field.key} orientation="horizontal" className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-3">
              <FieldLabel htmlFor={field.id} className="text-xs text-muted-foreground">{field.label}</FieldLabel>
              <Select value={view[field.key]} onValueChange={(value) => onChange({ ...view, [field.key]: value })}>
                <SelectTrigger id={field.id} className={SELECT}><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(field.options).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          ))}
        </FieldGroup>
        {showStatuses && (
          <>
            <Separator />
            <ToggleBadgeGroup legend="Status">
              {UNIT_STATUSES.map((status) => {
                const pressed = view.statuses.includes(status);
                return <ToggleBadge key={status} pressed={pressed} onClick={() => onChange({ ...view, statuses: UNIT_STATUSES.filter((item) => item === status ? !pressed : view.statuses.includes(item)) })}>{STATE_LABELS[status]}</ToggleBadge>;
              })}
            </ToggleBadgeGroup>
          </>
        )}
        {labels.length > 0 && (
          <>
            <Separator />
            <LabelFilter options={labels} labels={view.labels} unlabeled={view.unlabeled} onChange={(selection) => onChange({ ...view, ...selection })} />
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
