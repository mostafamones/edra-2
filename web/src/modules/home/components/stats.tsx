import Link from "@/components/shared/link";
import { Area, AreaChart } from "recharts";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { Card } from "@/components/ui/card";
import { ChartContainer } from "@/components/ui/chart";
import { rate, type Overview, type Week } from "../overview";
import { focus } from "./shared";

type Stat = { label: string; value: string; change: string | null; tone: "up" | "down" | "flat"; spark: (number | null)[] | null; href: string | null };
const sum = (weeks: Week[], key: "sessions" | "added") => weeks.reduce((total, week) => total + week[key], 0);
const tones = { up: "text-emerald-600 dark:text-emerald-400", down: "text-destructive", flat: "text-muted-foreground" };
const tone = (delta: number): Stat["tone"] => (delta > 0 ? "up" : delta < 0 ? "down" : "flat");
const signed = (delta: number) => `${delta > 0 ? "+" : ""}${delta}`;

/** Headline numbers: the last four weeks against the four before, with a twelve-week sparkline. */
export function HomeStats({ data, live, base }: { data: Overview; live: number | null; base: string }) {
  const weeks = data.attendance;
  const last = weeks?.slice(-4) ?? [], before = weeks?.slice(-8, -4) ?? [];
  const now = rate(last), then = rate(before);
  const stats: Stat[] = [
    ...(weeks ? [{
      label: "Attendance · 4 weeks", value: now === null ? "—" : `${now}%`, href: `${base}/attendance`,
      ...(now !== null && then !== null ? { change: `${signed(now - then)} pts`, tone: tone(now - then) } : { change: null, tone: "flat" as const }),
      spark: weeks.map(week => rate([week])),
    }, {
      label: "Sessions · 4 weeks", value: String(sum(last, "sessions")), href: `${base}/attendance`,
      change: signed(sum(last, "sessions") - sum(before, "sessions")), tone: tone(sum(last, "sessions") - sum(before, "sessions")),
      spark: weeks.map(week => week.sessions),
    }] : []),
    {
      label: "Active students", value: String(data.students.total), href: `${base}/students`,
      change: weeks ? `${signed(sum(last, "added"))} new` : null, tone: weeks ? tone(sum(last, "added")) : "flat" as const,
      spark: weeks?.map(week => week.added) ?? null,
    },
    {
      label: "Needs attention", value: String(data.attentionCount), href: null,
      change: live ? `${live} live now` : null, tone: "flat" as const, spark: null,
    },
  ];
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
    {stats.map(stat => {
      const body = <>
        <span className="flex items-center justify-between gap-2 text-sm text-muted-foreground">{stat.label}{stat.href && <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.5} className="size-4 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />}</span>
        <span className="flex items-end justify-between gap-3">
          <span className="space-y-1">
            <span className="block font-heading text-3xl font-semibold tabular-nums tracking-tight">{stat.value}</span>
            <span className={`block h-4 text-xs font-medium tabular-nums ${tones[stat.tone]}`}>{stat.change}{stat.change && stat.spark && <span className="font-normal text-muted-foreground"> vs prior 4 weeks</span>}</span>
          </span>
          {stat.spark && <Spark values={stat.spark} />}
        </span>
      </>;
      return <Card key={stat.label} className="gap-3 rounded-xl p-0 shadow-none">
        {stat.href ? <Link href={stat.href} className={`group flex flex-col gap-3 rounded-xl p-5 transition-colors hover:bg-muted/30 ${focus}`}>{body}<span className="sr-only">Open {stat.label.toLowerCase()}</span></Link> : <div className="flex flex-col gap-3 p-5">{body}</div>}
      </Card>;
    })}
  </div>;
}

function Spark({ values }: { values: (number | null)[] }) {
  const series = values.map((value, index) => ({ index, value }));
  return <ChartContainer config={{ value: { label: "Trend", color: "var(--chart-2)" } }} className="aspect-auto h-10 w-24 shrink-0" aria-hidden="true">
    <AreaChart data={series} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
      <Area dataKey="value" type="monotone" stroke="var(--color-value)" strokeWidth={1.5} fill="var(--color-value)" fillOpacity={0.12} connectNulls dot={false} isAnimationActive={false} />
    </AreaChart>
  </ChartContainer>;
}
