"use client";

import { useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { GridViewIcon, ListViewIcon, Settings02Icon } from "@hugeicons/core-free-icons";

import { ToggleBadge } from "@/components/shared/toggle-badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { UNIT_STATUSES, type UnitStatus } from "../started";

const ALL = "all";

/**
 * Course list view settings, applied to the data already loaded on the page.
 */
export function ViewSettings({ layout, academies, academy, statuses, group, onLayoutChange, onAcademyChange, onStatusesChange, onGroupChange }: {
  layout?: "grid" | "list";
  academies?: { slug: string; name: string }[];
  academy?: string;
  statuses: UnitStatus[];
  group: "none" | "academy" | "status";
  onLayoutChange: (value: "grid" | "list") => void;
  onAcademyChange: (value: string | undefined) => void;
  onStatusesChange: (value: UnitStatus[]) => void;
  onGroupChange: (value: "none" | "academy" | "status") => void;
}) {
  const [isolated, setIsolated] = useState<{ status: UnitStatus; previous: UnitStatus[] } | null>(null);
  const beforeClick = useRef<UnitStatus[]>(statuses);
  const toggle = (status: UnitStatus) => {
    if (isolated) {
      onStatusesChange(isolated.previous);
      setIsolated(null);
      return;
    }
    onStatusesChange(statuses.includes(status) ? statuses.filter((item) => item !== status) : UNIT_STATUSES.filter((item) => statuses.includes(item) || item === status));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Course view settings"><HugeiconsIcon icon={Settings02Icon} strokeWidth={1.5} aria-hidden="true" /></Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 max-w-[calc(100vw-2rem)] gap-2 p-3">
        <p className="font-heading mb-1 text-sm font-semibold">View settings</p>
        {layout && (
          <div role="group" aria-label="Layout" className="grid grid-cols-2 gap-2">
            {([["grid", GridViewIcon, "Grid"], ["list", ListViewIcon, "List"]] as const).map(([value, icon, label]) => (
              <Button key={value} variant={layout === value ? "secondary" : "outline"} aria-pressed={layout === value} className="aspect-square h-auto flex-col gap-1.5"
                onClick={() => onLayoutChange(value)}>
                <HugeiconsIcon icon={icon} strokeWidth={1.5} className="size-6" aria-hidden="true" />
                {label}
              </Button>
            ))}
          </div>
        )}
        {academies && academies.length > 1 && (
          <Field orientation="horizontal" className="grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-2">
            <FieldLabel htmlFor="view-academy" className="text-xs text-muted-foreground">Academy</FieldLabel>
            <Select value={academy ?? ALL} onValueChange={(value) => onAcademyChange(value === ALL ? undefined : value)}>
              <SelectTrigger id="view-academy" className="h-8 w-full min-w-0 border-transparent bg-muted/60 shadow-none hover:bg-muted dark:bg-muted/40 dark:hover:bg-muted"><SelectValue className="block! min-w-0 flex-1 truncate text-left" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All academies</SelectItem>
                {academies.map((item) => <SelectItem key={item.slug} value={item.slug}>{item.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        )}
        <Field orientation="horizontal" className="grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-2">
          <FieldLabel htmlFor="view-group" className="text-xs text-muted-foreground">Group by</FieldLabel>
          <Select value={group} onValueChange={(value) => onGroupChange(value as "none" | "academy" | "status")}>
            <SelectTrigger id="view-group" className="h-8 w-full min-w-0 border-transparent bg-muted/60 shadow-none hover:bg-muted dark:bg-muted/40 dark:hover:bg-muted"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="academy">Academy</SelectItem>
              <SelectItem value="status">Status</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Separator />
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Status</p>
          <div role="group" aria-label="Course status" className="flex flex-wrap gap-1.5">
            {UNIT_STATUSES.map((status) => {
              const active = statuses.includes(status);
              return <ToggleBadge key={status} pressed={active} className={cn("capitalize", isolated?.status === status && "aria-pressed:bg-primary/10 aria-pressed:hover:bg-primary/15")}
                onClick={(event) => {
                  if (event.detail > 1) return;
                  beforeClick.current = [...statuses];
                  toggle(status);
                }}
                onDoubleClick={() => {
                  setIsolated({ status, previous: beforeClick.current });
                  onStatusesChange([status]);
                }}>{status}</ToggleBadge>;
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
