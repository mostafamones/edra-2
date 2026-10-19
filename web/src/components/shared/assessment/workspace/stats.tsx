"use client";

import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export type StatItem = { label: string; value: ReactNode; note?: ReactNode; loading?: boolean };

/** The stat strip: a label, a large value and an optional one-line note per cell, in one divided card. */
export function StatStrip({ stats }: { stats: StatItem[] }) {
  return (
    // The 1px gap over a border-coloured card draws the dividers, whatever the column count.
    <Card className="grid grid-cols-2 gap-px bg-border py-0 lg:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="flex min-w-0 flex-col gap-1 bg-card px-5 py-4">
          <span className="text-xs font-medium text-muted-foreground">{stat.label}</span>
          {stat.loading ? <Skeleton className="my-1 h-6 w-16" /> : <span className="truncate font-heading text-2xl font-semibold tracking-tight tabular-nums">{stat.value}</span>}
          {stat.note && <div className="min-h-4 truncate text-xs text-muted-foreground">{stat.note}</div>}
        </div>
      ))}
    </Card>
  );
}
