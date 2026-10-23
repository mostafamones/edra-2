"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import { IconChartBar } from "@tabler/icons-react";

import { Segmented } from "@/components/shared/segmented";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { markBars, type MarkBar } from "../../../analytics";
import type { MarkFocus } from "../../../focus";
import type { Assignment } from "../../../types";
import { useMarks } from "../../../hooks/use-marks";

type Grouping = "parts" | "questions";
type Order = "position" | "hardest";

const config = { percent: { label: "Average", color: "var(--chart-2)" } } satisfies ChartConfig;
const percent = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });

/** Bars under half marks stand out: they are where students lost the most. */
const barColor = (value: number) => (value < 50 ? "var(--destructive)" : "var(--color-percent)");

function BarTooltip({ active, payload }: { active?: boolean; payload?: { payload: MarkBar }[] }) {
  const bar = payload?.[0]?.payload;
  if (!active || !bar) return null;
  return (
    <div className="grid gap-0.5 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <span className="font-medium">{bar.title}</span>
      <span className="text-muted-foreground">
        Average <span className="font-mono font-medium text-foreground tabular-nums">{percent.format(bar.percent)}%</span>
        {" · "}{bar.count} student{bar.count === 1 ? "" : "s"}
      </span>
      <span className="text-muted-foreground">Select to see who lost marks</span>
    </div>
  );
}

/**
 * Average marks per part (fast marks included) or per question (answers only). Selecting a bar
 * opens the students who lost marks on it.
 */
export function MarkAnalytics({ assignment, onSelect }: { assignment: Assignment; onSelect: (target: Pick<MarkFocus, "kind" | "id">) => void }) {
  const { query } = useMarks(assignment);
  const [grouping, setGrouping] = useState<Grouping>("questions");
  const [order, setOrder] = useState<Order>("position");

  if (!assignment.ready) return null;
  if (query.isPending) return <Skeleton className="h-80 rounded-xl" />;
  // A failed load is reported by the Students tab; the chart just stays out of the way.
  if (!query.data) return null;

  const bars = markBars(assignment, query.data.students)[grouping];
  const shown = order === "hardest" ? [...bars].sort((a, b) => a.percent - b.percent) : bars;

  return (
    <Card>
      <CardHeader className="gap-0">
        <CardTitle className="font-medium">Marks by {grouping === "questions" ? "question" : "part"}</CardTitle>
        <CardDescription>Average score as a share of the maximum. Select a bar to see who lost marks.</CardDescription>
        <CardAction className="flex flex-wrap justify-end gap-2">
          <Segmented label="Group by" value={grouping} onChange={setGrouping}
            options={[{ value: "questions", label: "Questions" }, { value: "parts", label: "Parts" }]} />
        </CardAction>
      </CardHeader>
      <CardContent>
        {shown.length === 0 ? (
          <Empty className="min-h-58 p-6">
            <EmptyHeader className="gap-1">
              <EmptyMedia variant="icon"><IconChartBar aria-hidden="true" /></EmptyMedia>
              <EmptyTitle>No marks by {grouping === "questions" ? "question" : "part"} yet</EmptyTitle>
              <EmptyDescription>{grouping === "parts" ? "Mark students" : "Enter students’ answers question by question"} to see which {grouping} were easy and which lost the most marks.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ChartContainer config={config} className="aspect-auto h-58 w-full">
            <BarChart data={shown} margin={{ top: 8, right: 4, left: -16, bottom: 0 }} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} interval={0} />
              <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(value: number) => `${value}%`} tickLine={false} axisLine={false} />
              <ChartTooltip cursor={false} content={<BarTooltip />} />
              <Bar dataKey="percent" radius={4} maxBarSize={48} className="cursor-pointer"
                onClick={(_, index) => { const bar = shown[index]; if (bar) onSelect({ kind: grouping === "questions" ? "question" : "part", id: bar.id }); }}>
                {shown.map((bar) => <Cell key={bar.id} fill={barColor(bar.percent)} />)}
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
