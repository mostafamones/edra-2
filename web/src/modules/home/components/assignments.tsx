import { HugeiconsIcon } from "@hugeicons/react";
import { SquareArrowOutUpRightIcon } from "@hugeicons/core-free-icons";
import Link from "@/components/shared/link";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import type { Overview } from "../overview";
import { heading } from "./shared";

const config = { average: { label: "Average", color: "var(--chart-2)" } } satisfies ChartConfig;
/** Matches the assignment workspace: averages under half stand out. */
const barColor = (value: number) => (value < 50 ? "var(--destructive)" : "var(--color-average)");

/** Average marked percentage of the latest marked assignments, oldest to newest. */
export function AssignmentPerformance({ items, base }: { items: NonNullable<Overview["assignments"]>; base: string }) {
  const marked = items.reduce((total, item) => total + item.marked, 0);
  const overall = marked ? Math.round(items.reduce((total, item) => total + item.average * item.marked, 0) / marked) : null;
  const below = items.reduce((total, item) => total + item.below, 0);
  const series = items.map(item => ({ ...item, label: item.title.length > 14 ? `${item.title.slice(0, 13)}…` : item.title }));
  return <Card aria-labelledby="home-assignments" className="h-full min-w-0 gap-4 rounded-xl pb-2 shadow-none">
    <div className="flex flex-wrap items-start justify-between gap-4 px-6">
      <div className="space-y-1">
        <h2 id="home-assignments" className={heading}>Assignment performance</h2>
        {overall !== null && <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><span className="font-heading text-3xl font-semibold tabular-nums tracking-tight">{overall}%</span><span className="text-sm text-muted-foreground">average across {items.length} {items.length === 1 ? "assignment" : "assignments"}</span>{below > 0 && <span className="text-sm font-medium text-destructive tabular-nums">{below} below 50%</span>}</p>}
      </div>
      <Button asChild variant="ghost" size="sm" className="-mr-2"><Link href={`${base}/assignments`}>Assignments<HugeiconsIcon icon={SquareArrowOutUpRightIcon} strokeWidth={1.5} aria-hidden="true" /></Link></Button>
    </div>
    {items.length ? <ChartContainer config={config} className="aspect-auto h-56 w-full px-2" role="img" aria-label={`Assignment averages: ${items.map(item => `${item.title}, ${Math.round(item.average)}%, ${item.marked} of ${item.recipients} marked`).join("; ")}`}>
      <BarChart data={series} accessibilityLayer margin={{ left: 4, right: 16, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tickFormatter={value => `${value}%`} tickLine={false} axisLine={false} width={40} tick={{ fontSize: 11 }} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} interval={0} tick={{ fontSize: 11 }} />
        <ChartTooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} content={({ active, payload }) => {
          const item = payload?.[0]?.payload as (typeof series)[number] | undefined;
          return active && item ? <div className="grid max-w-64 gap-0.5 rounded-lg border bg-background px-3 py-2 text-xs shadow-xl">
            <span dir="auto" className="font-medium">{item.title}</span>
            <span className="text-muted-foreground">Average <span className="font-medium text-foreground tabular-nums">{Math.round(item.average)}%</span> · {item.marked} of {item.recipients} marked</span>
            {item.below > 0 && <span className="text-destructive">{item.below} below 50%</span>}
          </div> : null;
        }} />
        <Bar dataKey="average" radius={[5, 5, 0, 0]} maxBarSize={44} isAnimationActive={false}>
          {series.map(item => <Cell key={item.id} fill={barColor(item.average)} />)}
        </Bar>
      </BarChart>
    </ChartContainer> : <p className="py-16 text-center text-sm text-muted-foreground">No marked assignments yet</p>}
  </Card>;
}
