import { useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { Segmented } from "@/components/shared/segmented";
import { rate, type Week } from "../overview";
import { weekLabel } from "./shared";

type Range = "4" | "8" | "12";
const ranges = [{ value: "4", label: "4w" }, { value: "8", label: "8w" }, { value: "12", label: "12w" }] satisfies { value: Range; label: string }[];
const statuses = ["present", "late", "excused", "absent"] as const;
const config = {
  present: { label: "Present", color: "var(--chart-2)" },
  late: { label: "Late", color: "var(--chart-4)" },
  excused: { label: "Excused", color: "var(--chart-5)" },
  absent: { label: "Absent", color: "var(--destructive)" },
} satisfies ChartConfig;

/** Official marks per week by status. Range changes only slice the loaded twelve weeks. */
export function AttendanceTrend({ weeks }: { weeks: Week[] }) {
  const [range, setRange] = useState<Range>("8");
  const shown = weeks.slice(-Number(range)).map(week => ({ ...week, label: weekLabel.format(new Date(week.week)), rate: rate([week]) }));
  const overall = rate(shown);
  const sessions = shown.reduce((total, week) => total + week.sessions, 0);
  const marked = shown.some(week => week.present + week.late + week.absent + week.excused > 0);
  return <Card aria-labelledby="home-trend" className="h-full min-w-0 gap-4 rounded-xl pb-2 shadow-none">
    <div className="flex flex-wrap items-start justify-between gap-4 px-6">
      <div className="space-y-1">
        <h2 id="home-trend" className="text-sm text-muted-foreground">Attendance</h2>
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><span className="font-heading text-4xl font-semibold tabular-nums tracking-tight">{overall === null ? "—" : `${overall}%`}</span><span className="text-sm text-muted-foreground tabular-nums">{sessions} finalized {sessions === 1 ? "session" : "sessions"}</span></p>
      </div>
      <Segmented label="Range" value={range} options={ranges} onChange={setRange} />
    </div>
    {marked ? <ChartContainer config={config} className="aspect-auto h-72 w-full px-2" role="img" aria-label={`Weekly attendance: ${shown.map(week => `${week.label}, ${week.rate === null ? "no finalized sessions" : `${week.rate}%, ${week.absent} absent`}`).join("; ")}`}>
      <AreaChart data={shown} accessibilityLayer margin={{ left: 4, right: 16, top: 8, bottom: 0 }}>
        <defs>{statuses.map(status => <linearGradient key={status} id={`home-fill-${status}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={`var(--color-${status})`} stopOpacity={0.45} /><stop offset="100%" stopColor={`var(--color-${status})`} stopOpacity={0.08} /></linearGradient>)}</defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} tick={{ fontSize: 11 }} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} minTickGap={16} tick={{ fontSize: 11 }} />
        <ChartTooltip cursor={{ stroke: "var(--border)" }} content={({ active, payload }) => {
          const week = payload?.[0]?.payload as (typeof shown)[number] | undefined;
          return active && week ? <div className="grid min-w-40 gap-1 rounded-lg border bg-background px-3 py-2 text-xs shadow-xl">
            <span className="font-medium">Week of {week.label}</span>
            {statuses.map(status => <span key={status} className="flex items-center justify-between gap-4"><span className="flex items-center gap-1.5 text-muted-foreground"><span className="size-2 rounded-full" style={{ background: config[status].color }} />{config[status].label}</span><span className="font-medium tabular-nums">{week[status]}</span></span>)}
            <span className="mt-1 flex justify-between gap-4 border-t pt-1 text-muted-foreground"><span>{week.sessions} {week.sessions === 1 ? "session" : "sessions"}</span><span className="font-medium text-foreground tabular-nums">{week.rate === null ? "—" : `${week.rate}%`}</span></span>
          </div> : null;
        }} />
        {statuses.map(status => <Area key={status} dataKey={status} stackId="marks" type="monotone" stroke={`var(--color-${status})`} strokeWidth={1.5} fill={`url(#home-fill-${status})`} isAnimationActive={false} />)}
        <ChartLegend content={<ChartLegendContent />} />
      </AreaChart>
    </ChartContainer> : <p className="py-24 text-center text-sm text-muted-foreground">No finalized sessions in the last {range} weeks</p>}
  </Card>;
}
