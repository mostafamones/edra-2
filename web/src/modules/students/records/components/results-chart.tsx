"use client";

import Link from "next/link";
import { useState } from "react";
import { Bar, BarChart, Cell, LabelList, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatAcademyLong } from "@/lib/academy-time";
import { assessmentSnapshot, announcedResults, type StudentResult } from "../results";

const types = { assignment: "Assignments", quiz: "Quizzes", exam: "Exams" };
const paths: Record<string, string> = { assignment: "assignments", quiz: "quizzes", exam: "exams" };

export function ResultsChart({ items, base, sampled = false }: { items: StudentResult[]; base: string; sampled?: boolean }) {
  const [kind, setKind] = useState(() => Object.keys(types).find(type => announcedResults(items, type).length > 0) ?? "assignment");
  const { points, latest, previous } = assessmentSnapshot(items, kind);
  const series = points.map(point => ({ ...point, label: point.title.length > 15 ? point.title.slice(0, 14) + "…" : point.title }));
  const multipleTypes = new Set(items.map(item => item.kind)).size > 1;

  return <div className="space-y-4">
    {multipleTypes && <Select value={kind} onValueChange={setKind}><SelectTrigger aria-label="Assessment type" className="h-8 w-36"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(types).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>}
    {latest ? <div className="grid items-center gap-6 lg:grid-cols-2">
      <div className="min-w-0 space-y-2">
        <p className="text-xs text-muted-foreground">Latest announced {kind}{sampled ? " in these records" : ""}</p>
        <Link dir="auto" className="block break-words rounded text-sm font-semibold hover:underline focus-visible:ring-2 focus-visible:ring-ring" href={base + "/" + paths[kind] + "/" + latest.id}>{latest.title}</Link>
        <div className="flex flex-wrap items-center gap-2"><p className="font-heading text-2xl font-semibold tabular-nums">{latest.score}</p><Badge>{Math.round(latest.percent)}%</Badge></div>
        <p className="text-xs text-muted-foreground">Announced <time dateTime={latest.at}>{formatAcademyLong(latest.at)}</time></p>
      </div>
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className="text-muted-foreground">{points.length} announced {points.length === 1 ? kind : types[kind as keyof typeof types].toLowerCase()}</span>{previous && <span aria-label={"Previous " + Math.round(previous.percent) + "%, latest " + Math.round(latest.percent) + "%"}>{Math.round(previous.percent)}% → {Math.round(latest.percent)}%</span>}</div>
        <ChartContainer config={{ percent: { label: "Announced score", color: "var(--chart-2)" } }} className="aspect-auto h-36 w-full" role="img" aria-label={"Recent announced " + kind + " scores: " + points.map(point => point.title + ", " + point.score).join("; ")}>
          <BarChart data={series} accessibilityLayer margin={{ left: 4, right: 4, top: 20, bottom: 0 }}>
            <YAxis hide domain={[0, 100]} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} interval={0} tick={{ fontSize: 10 }} height={32} />
            <ChartTooltip cursor={false} content={({ active, payload }) => { const point = payload?.[0]?.payload as (typeof series)[number] | undefined; return active && point ? <div className="max-w-64 space-y-1 rounded-lg border bg-background p-3 text-xs shadow-lg"><p className="font-semibold">{point.title}</p><p>{point.score} · {Math.round(point.percent)}%</p><p className="text-muted-foreground">{formatAcademyLong(point.at)}</p></div> : null; }} />
            <Bar dataKey="percent" radius={[5, 5, 0, 0]} maxBarSize={36} isAnimationActive={false}>
              {series.map((point, index) => <Cell key={point.id} fill={index === series.length - 1 ? "var(--chart-2)" : "var(--primary)"} />)}
              <LabelList dataKey="percent" position="top" formatter={value => Math.round(Number(value)) + "%"} fill="var(--muted-foreground)" fontSize={11} />
            </Bar>
          </BarChart>
        </ChartContainer>
      </div>
    </div> : <p className="py-4 text-sm text-muted-foreground">No announced {types[kind as keyof typeof types].toLowerCase()} in these records</p>}
  </div>;
}
