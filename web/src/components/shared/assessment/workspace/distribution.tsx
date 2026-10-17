"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { IconChartBar } from "@tabler/icons-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";

const config = { students: { label: "Students", color: "var(--chart-2)" } } satisfies ChartConfig;

/** How many students scored in each tenth of the total, from their percentages (0–100). */
const buckets = (scores: number[]) => Array.from({ length: 10 }, (_, index) => ({
  range: `${index * 10}–${index === 9 ? 100 : index * 10 + 9}%`,
  students: scores.filter((score) => Math.min(Math.floor(score / 10), 9) === index).length,
}));

/** Marked students by share of the total mark. `scores` is undefined while loading. */
export function ScoreDistribution({ scores }: { scores: number[] | undefined }) {
  if (scores === undefined) return <Skeleton className="h-80 rounded-xl" />;
  return (
    <Card>
      <CardHeader><CardTitle className="font-medium">Scores</CardTitle></CardHeader>
      <CardContent>
        {scores.length === 0 ? (
          <Empty className="min-h-58 p-6">
            <EmptyHeader className="gap-1">
              <EmptyMedia variant="icon"><IconChartBar aria-hidden="true" /></EmptyMedia>
              <EmptyTitle>No marks yet</EmptyTitle>
              <EmptyDescription>The spread of scores shows here as students are marked.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ChartContainer config={config} className="aspect-auto h-58 w-full">
            <BarChart data={buckets(scores)} margin={{ top: 8, right: 4, left: -16, bottom: 0 }} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="range" tickLine={false} axisLine={false} tickMargin={8} interval={0} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <Bar dataKey="students" fill="var(--color-students)" radius={4} maxBarSize={48} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
