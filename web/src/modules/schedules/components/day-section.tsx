"use client";

import type { ReactNode } from "react";
import { IconChevronDown } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

/** A collapsible titled list section; the count is the number of rows it holds. */
export function DaySection({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  const headingId = `schedule-section-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <Collapsible asChild defaultOpen>
      <section aria-labelledby={headingId} className="group/day">
        <CollapsibleTrigger className="mb-2.5 flex w-full items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
          <h2 id={headingId} className="text-sm font-semibold">{title}</h2>
          <Badge variant="secondary" aria-label={`${count} ${count === 1 ? "entry" : "entries"}`}>{count}</Badge>
          <div className="h-px flex-1 bg-border" aria-hidden="true" />
          <IconChevronDown
            className="size-4 text-muted-foreground transition-transform group-data-[state=closed]/day:-rotate-[-90deg]"
            aria-hidden="true"
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          <div className="mt-2 grid gap-2">{children}</div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}
