"use client";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatAcademyLong } from "@/lib/academy-time";
import { announcedResults, type StudentResult } from "../results";
const date=new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"short",timeZone:"Africa/Cairo"});

export function ResultsChart({items}:{items:StudentResult[]}) {
  const [kind,setKind]=useState(()=>["assignment","quiz","exam"].find(type=>announcedResults(items,type).length>0)??"assignment");
  const points=announcedResults(items,kind).map(point=>({...point,label:date.format(new Date(point.at))}));
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Announced results</h2><Select value={kind} onValueChange={setKind}><SelectTrigger aria-label="Assessment type" className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="assignment">Assignments</SelectItem><SelectItem value="quiz">Quizzes</SelectItem><SelectItem value="exam">Exams</SelectItem></SelectContent></Select></div>
    {points.length ? <><ChartContainer config={{percent:{label:"Score",color:"var(--chart-2)"}}} className="h-52 w-full aspect-auto" role="img" aria-label={`Recent announced ${kind} scores: ${points.map(p=>`${p.title}, ${p.score}`).join("; ")}`}>
      <BarChart data={points} accessibilityLayer margin={{left:-22,right:8,top:8,bottom:0}}><CartesianGrid vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} /><YAxis domain={[0,100]} ticks={[0,50,100]} tickFormatter={value=>`${value}%`} tickLine={false} axisLine={false} /><ChartTooltip cursor={false} content={({active,payload})=>{const point=payload?.[0]?.payload as (typeof points)[number]|undefined;return active&&point?<div className="max-w-64 space-y-1 rounded-lg border bg-background p-3 text-xs shadow-lg"><p className="font-medium">{point.title}</p><p>{point.score} · {Math.round(point.percent)}%</p><p className="text-muted-foreground">{formatAcademyLong(point.at)}</p></div>:null;}} /><Bar dataKey="percent" fill="var(--chart-2)" radius={[5,5,0,0]} maxBarSize={38} isAnimationActive={false} /></BarChart>
    </ChartContainer><p className="text-xs text-muted-foreground">Latest {points.length} announced {kind} results in the loaded records</p></> : <div className="grid h-52 place-items-center text-sm text-muted-foreground">No announced {kind} results in these records</div>}
  </div>;
}
