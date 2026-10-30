"use client";

import { useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "cn";
import { Cancel01Icon, GridViewIcon, PreferenceHorizontalIcon, TableIcon } from "@hugeicons/core-free-icons";

import { Segmented } from "@/components/shared/segmented";
import { ToggleBadge } from "@/components/shared/toggle-badge";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ALL, DEFAULT_PARAMS, sameStatuses, type AssessmentListParams } from "../params";
import { ASSESSMENT_TYPES, DEFAULT_STATUSES, STATUS_KEYS, statusKey, TYPE_PLURALS, TYPE_STATUSES, type AssessmentType, type StatusKey } from "../types";
import type { AssessmentView } from "../view";
import { statusLabel, TYPE_ICONS } from "./facts";

const GROUP_LABELS = { none: "No grouping", type: "Type", status: "Status" } as const;
const SORT_LABELS = { newest: "Newest first", title: "Title" } as const;
/** Status words across every type, in list order; the database groups by the same order. */
const STATUS_ORDER = ["preparing", "ready", "scheduled", "open", "headroom", "active", "closed", "archived"];

type StatusToggle = { id: string; label: string; keys: StatusKey[] };
const SELECT = "h-8 w-full min-w-0 border-transparent bg-muted/60 shadow-none hover:bg-muted dark:bg-muted/40 dark:hover:bg-muted";

type Props = {
  params: AssessmentListParams;
  onChange: (change: Partial<AssessmentListParams>) => void;
  view: AssessmentView;
  onView: (view: AssessmentView) => void;
};

/** View, grouping, order and shown statuses: per status word across types, or per type in that type's own words. */
export function ViewOptions({ params, onChange, view, onView }: Props) {
  const changed = params.group !== "none" || params.sort !== "newest" || !sameStatuses(params.statuses, DEFAULT_STATUSES);
  const types = params.type === ALL ? ASSESSMENT_TYPES : [params.type];
  // All types: one toggle per status word across the listed types. Grouping by status always uses it.
  const [mode, setMode] = useState<"all" | "type">("all");
  // With one type listed both modes match; show that type's own section.
  const combined = types.length > 1 && (params.group === "status" || mode === "all");
  const sections: { id: string; type?: AssessmentType; toggles: StatusToggle[] }[] = combined
    ? [{ id: "all", toggles: STATUS_ORDER.flatMap((status) => {
        const owners = types.filter((type) => TYPE_STATUSES[type].includes(status));
        return owners.length ? [{ id: status, label: statusLabel(owners[0], status), keys: owners.map((type) => statusKey(type, status)) }] : [];
      }) }]
    : types.map((type) => ({ id: type, type, toggles: TYPE_STATUSES[type].map((status) => ({ id: statusKey(type, status), label: statusLabel(type, status), keys: [statusKey(type, status)] })) }));

  // Double-click shows only that status; the next click restores the selection from before (as in student courses).
  const [isolated, setIsolated] = useState<{ id: string; previous: StatusKey[] } | null>(null);
  const beforeClick = useRef<StatusKey[]>(params.statuses);
  const setStatuses = (keys: Iterable<StatusKey>) => {
    const next = new Set(keys);
    // Canonical order keeps URLs and query keys stable.
    onChange({ statuses: STATUS_KEYS.filter((item) => next.has(item)) });
  };
  const toggle = (toggle: StatusToggle) => {
    if (isolated) {
      onChange({ statuses: isolated.previous });
      setIsolated(null);
      return;
    }
    const next = new Set(params.statuses);
    const allShown = toggle.keys.every((key) => next.has(key));
    for (const key of toggle.keys) if (allShown) next.delete(key); else next.add(key);
    setStatuses(next);
  };

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
      <PopoverContent align="end" className="w-80 gap-3">
        <div className="mb-1 flex min-h-7 items-center justify-between">
          <p className="font-heading text-sm font-semibold">View options</p>
          {changed && (
            <Button variant="ghost" size="sm" className="-mr-2 h-7 text-muted-foreground"
              onClick={(event) => {
                // The button is about to disappear; keep focus inside the panel.
                event.currentTarget.closest<HTMLElement>("[data-slot=popover-content]")?.focus();
                setIsolated(null);
                onChange({ group: DEFAULT_PARAMS.group, sort: DEFAULT_PARAMS.sort, statuses: [...DEFAULT_STATUSES] });
              }}>
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.5} />Reset
            </Button>
          )}
        </div>
        <Segmented fill label="View" value={view} onChange={onView} options={[
          { value: "table", label: <><HugeiconsIcon icon={TableIcon} strokeWidth={1.5} className="mr-1.5 size-4" aria-hidden="true" />Table</> },
          { value: "cards", label: <><HugeiconsIcon icon={GridViewIcon} strokeWidth={1.5} className="mr-1.5 size-4" aria-hidden="true" />Cards</> },
        ]} />
        <FieldGroup className="gap-2">
          <Field orientation="horizontal" className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-3">
            <FieldLabel htmlFor="view-group" className="text-xs text-muted-foreground">Group by</FieldLabel>
            <Select value={params.group} onValueChange={(group) => onChange({ group: group as AssessmentListParams["group"] })}>
              <SelectTrigger id="view-group" className={SELECT}><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(GROUP_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field orientation="horizontal" className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-3">
            <FieldLabel htmlFor="view-sort" className="text-xs text-muted-foreground">Order</FieldLabel>
            <Select value={params.sort} onValueChange={(sort) => onChange({ sort: sort as AssessmentListParams["sort"] })}>
              <SelectTrigger id="view-sort" className={SELECT}><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(SORT_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </FieldGroup>
        <Separator />
        <div className="flex max-h-72 flex-col gap-3 overflow-y-auto">
          {types.length > 1 && (
            <Segmented fill label="Status toggles" value={combined ? "all" : "type"} disabled={params.group === "status"}
              onChange={(next) => { setIsolated(null); setMode(next); }}
              options={[{ value: "all", label: "All types" }, { value: "type", label: "Per type" }]} />
          )}
          {sections.map((section) => (
            <fieldset key={section.id} className="flex flex-col gap-1.5">
              <legend className={section.type ? "mb-1.5 flex items-center gap-1.5 pl-1 text-xs font-medium text-muted-foreground" : "sr-only"}>
                {section.type && <HugeiconsIcon icon={TYPE_ICONS[section.type]} strokeWidth={1.5} className="size-3.5" aria-hidden="true" />}
                {section.type ? TYPE_PLURALS[section.type] : "Statuses"}
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {section.toggles.map((item) => {
                  const count = item.keys.filter((key) => params.statuses.includes(key)).length;
                  const pressed = count === item.keys.length ? true : count === 0 ? false : "mixed";
                  return (
                    // Same toggles as the student courses view settings; "mixed" when only some types show it.
                    <ToggleBadge key={item.id} pressed={pressed === true} aria-pressed={pressed}
                      className={cn(pressed === "mixed" && "border border-dashed border-input text-foreground",
                        isolated?.id === item.id && "aria-pressed:bg-primary/10 aria-pressed:hover:bg-primary/15")}
                      onClick={(event) => {
                        if (event.detail > 1) return;
                        beforeClick.current = [...params.statuses];
                        toggle(item);
                      }}
                      onDoubleClick={() => {
                        setIsolated({ id: item.id, previous: beforeClick.current });
                        setStatuses(item.keys);
                      }}>
                      {item.label}
                    </ToggleBadge>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
