"use client";

import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";

/** A titled list section; the count is the number of rows it holds. */
export function DaySection({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  const headingId = `schedule-section-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <section aria-labelledby={headingId}>
      <div className="mb-2.5 flex items-center gap-2">
        <h2 id={headingId} className="text-sm font-semibold">{title}</h2>
        <Badge variant="secondary" aria-label={`${count} ${count === 1 ? "entry" : "entries"}`}>{count}</Badge>
        <div className="h-px flex-1 bg-border" aria-hidden="true" />
      </div>
      <div className="grid gap-2">{children}</div>
    </section>
  );
}
