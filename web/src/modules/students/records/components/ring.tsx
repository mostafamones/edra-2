"use client";
import { Cell, Pie, PieChart } from "recharts";
import { ChartContainer } from "@/components/ui/chart";

/** A measured fraction, not a loading indicator. The center always states its meaning. */
export function MetricRing({value,total,label,display}:{value:number;total:number;label:string;display:string}) {
  const fraction=total>0?Math.min(1,Math.max(0,value/total)):0;
  return <div className="relative size-24 shrink-0" role="img" aria-label={label}>
    <ChartContainer config={{value:{label,color:"var(--primary)"}}} className="size-24 aspect-square" aria-hidden="true">
      <PieChart><Pie data={[{value:fraction},{value:1-fraction||0}]} dataKey="value" innerRadius={35} outerRadius={43} startAngle={90} endAngle={-270} stroke="none" isAnimationActive={false}><Cell fill="var(--primary)" /><Cell fill="var(--muted)" /></Pie></PieChart>
    </ChartContainer>
    <span className="pointer-events-none absolute inset-0 grid place-items-center text-lg font-semibold tabular-nums">{display}</span>
  </div>;
}
