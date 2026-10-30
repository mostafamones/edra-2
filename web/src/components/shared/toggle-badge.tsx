import type { ComponentProps, ReactNode } from "react";

import { FieldLegend, FieldSet } from "@/components/ui/field";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";

/** A badge-sized toggle for filters: neutral, and a brighter neutral when pressed so it never reads as a palette color. */
export function ToggleBadge({ className, ...props }: ComponentProps<typeof Toggle>) {
  return <Toggle size="sm" className={cn("h-6 max-w-40 min-w-0 gap-1.5 rounded-sm bg-muted/60 px-2 text-xs font-normal text-muted-foreground aria-pressed:bg-foreground/10 aria-pressed:text-foreground aria-pressed:hover:bg-foreground/15", className)} {...props} />;
}

/** A labelled, wrapping set of toggle badges for a filter panel. */
export function ToggleBadgeGroup({ legend, children }: { legend: ReactNode; children: ReactNode }) {
  return (
    <FieldSet className="gap-2">
      <FieldLegend variant="label" className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">{legend}</FieldLegend>
      <div className="flex max-h-48 flex-wrap gap-1 overflow-y-auto">{children}</div>
    </FieldSet>
  );
}
