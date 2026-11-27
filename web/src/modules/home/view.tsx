import Link from "@/components/shared/link";
import type { ComponentProps } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, StudentsIcon, AssignmentsIcon, BookOpen01Icon, Calendar03Icon, PlayIcon, CheckmarkCircle02Icon, Alert02Icon, ChartLineData01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { QueryContent } from "@/components/shared/query-content";
import type { LiveSession } from "@/modules/sessions";
import type { Overview } from "./overview";

type Read<T> = ComponentProps<typeof QueryContent<T>>["query"];
type Week = NonNullable<Overview["attendance"]>[number];
const focus = "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const title = "font-heading text-base font-semibold";
const kinds = {
  attendance: { label: "Finalize attendance", icon: Calendar03Icon, path: "/attendance/", action: "Review" },
  review: { label: "Unit awaiting publication", icon: BookOpen01Icon, path: "/content/", action: "Review" },
  assignment: { label: "Online assignment submissions to mark", icon: AssignmentsIcon, path: "/assignments/", action: "Mark" },
};
const chart = { rate: { label: "Attendance", color: "var(--chart-2)" } } satisfies ChartConfig;
const weekLabel = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });
/** Present and late over present, late and absent; null when nothing was finalized. */
export const rate = (weeks: Pick<Week, "attended" | "counted">[]) => {
  const counted = weeks.reduce((sum, week) => sum + week.counted, 0);
  return counted ? Math.round(weeks.reduce((sum, week) => sum + week.attended, 0) / counted * 100) : null;
};

/** Operational overview: alerts first, then headline numbers, trends and today's plan. */
export function HomeView({ academyName, base, live, overview }: {
  academyName: string; base: string; live: Read<LiveSession[]>; overview: Read<Overview>;
}) {
  return <main className="page-shell" aria-label={academyName}>
    <header className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Home</h1>
      <Button asChild><Link href={`${base}/attendance/new`}><HugeiconsIcon icon={PlayIcon} strokeWidth={1.5} aria-hidden="true" />Start session</Link></Button>
    </header>

    <QueryContent query={live} label="live sessions" isEmpty={() => false} emptyTitle="No live sessions" loading={null}>
      {items => items.length > 0 && <ul aria-label="Live sessions" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{items.map(session => <li key={session.id}>
        <Link href={`${base}/attendance/${session.id}`} className={`flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 transition-colors hover:bg-primary/10 ${focus}`}>
          <span className="relative flex size-2.5 shrink-0" aria-hidden="true"><span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:hidden" /><span className="relative inline-flex size-2.5 rounded-full bg-primary" /></span>
          <span className="min-w-0 flex-1"><Badge variant="secondary" className="mb-1">Live</Badge><span dir="auto" className="block truncate text-sm font-medium">{session.scheduleTitle}</span></span>
          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.5} className="size-4 shrink-0" aria-hidden="true" />
        </Link>
      </li>)}</ul>}
    </QueryContent>

    <QueryContent query={overview} label="academy overview" isEmpty={() => false} emptyTitle="No overview">
      {data => data.year === null ? <Card className="p-5 font-medium">No open academic year</Card> : <Dashboard data={data} base={base} />}
    </QueryContent>
  </main>;
}

function Dashboard({ data, base }: { data: Overview; base: string }) {
  const attendance = data.attendance && rate(data.attendance);
  const stats = [
    { label: "Active students", value: data.students.total, href: `${base}/students`, icon: StudentsIcon },
    { label: "Online students", value: data.students.online, href: `${base}/students?type=online_only`, icon: BookOpen01Icon },
    ...(data.attendance ? [{ label: "Attendance · 8 weeks", value: attendance === null ? "—" : `${attendance}%`, href: `${base}/attendance`, icon: ChartLineData01Icon }] : []),
    { label: "Needs attention", value: data.attentionCount, href: null, icon: Alert02Icon },
  ];
  return <>
    <section aria-labelledby="home-alerts" className="space-y-3">
      <h2 id="home-alerts" className="sr-only">Alerts</h2>
      {data.attention.length ? <Card className="gap-0 overflow-hidden rounded-xl py-0 shadow-none">
        <div className="flex items-center gap-2 border-b bg-amber-500/5 px-4 py-3 text-sm font-medium sm:px-5">
          <HugeiconsIcon icon={Alert02Icon} strokeWidth={1.5} className="size-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          {data.attentionCount} {data.attentionCount === 1 ? "item needs" : "items need"} attention
        </div>
        <ul className="divide-y">{data.attention.map(item => {
          const kind = kinds[item.kind];
          return <li key={`${item.kind}:${item.id}`}><Link href={`${base}${kind.path}${item.id}`} className={`group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 sm:px-5 ${focus}`}>
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted"><HugeiconsIcon icon={kind.icon} strokeWidth={1.5} className="size-4 text-muted-foreground" aria-hidden="true" /></span>
            <span className="min-w-0 flex-1"><span dir="auto" className="block truncate text-sm font-medium">{item.title}</span><span className="block text-xs text-muted-foreground">{kind.label}{item.kind === "assignment" ? ` · ${item.amount}` : ""}</span></span>
            <span className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground group-hover:text-foreground"><span className="hidden sm:inline">{kind.action}</span><HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.5} className="size-4" aria-hidden="true" /></span>
          </Link></li>;
        })}</ul>
        {data.attentionCount > data.attention.length && <p className="border-t px-5 py-2.5 text-xs text-muted-foreground">Showing the oldest {data.attention.length} of {data.attentionCount} items</p>}
      </Card> : <div className="flex items-center gap-2 rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground"><HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={1.5} className="size-4" aria-hidden="true" />All caught up</div>}
    </section>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map(item => {
        const value = <span className="font-heading text-3xl font-semibold tabular-nums tracking-tight">{item.value}</span>;
        return <Card key={item.label} className="gap-2 rounded-xl p-4 shadow-none sm:p-5">
          <span className="flex items-center justify-between gap-2 text-sm text-muted-foreground">{item.label}<HugeiconsIcon icon={item.icon} strokeWidth={1.5} className="size-4 shrink-0" aria-hidden="true" /></span>
          {item.href ? <Link href={item.href} className={`flex items-end justify-between rounded-sm ${focus}`}>{value}<HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.5} className="size-4 text-muted-foreground" aria-hidden="true" /><span className="sr-only">View {item.label.toLowerCase()}</span></Link> : value}
        </Card>;
      })}
    </div>

    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-6">
        {data.attendance && <AttendanceTrend weeks={data.attendance} />}
        <Grades data={data} base={base} />
      </div>
      <Today data={data} base={base} />
    </div>
  </>;
}

function AttendanceTrend({ weeks }: { weeks: Week[] }) {
  const series = weeks.map(week => ({ ...week, label: weekLabel.format(new Date(week.week)), rate: rate([week]) }));
  return <Card aria-labelledby="home-trend" className="gap-4 rounded-xl p-5 shadow-none">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 id="home-trend" className={title}>Attendance by week</h2><span className="text-xs text-muted-foreground">Finalized sessions</span></div>
    {weeks.some(week => week.counted) ? <ChartContainer config={chart} className="aspect-auto h-48 w-full" role="img" aria-label={`Weekly attendance: ${series.map(week => `${week.label}, ${week.rate === null ? "no finalized sessions" : `${week.rate}%`}`).join("; ")}`}>
      <BarChart data={series} accessibilityLayer margin={{ left: 0, right: 4, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tickFormatter={value => `${value}%`} tickLine={false} axisLine={false} width={36} tick={{ fontSize: 11 }} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} interval={0} tick={{ fontSize: 11 }} />
        <ChartTooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} content={({ active, payload }) => {
          const week = payload?.[0]?.payload as (typeof series)[number] | undefined;
          return active && week ? <div className="grid gap-0.5 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl">
            <span className="font-medium">Week of {week.label}</span>
            <span className="text-muted-foreground">{week.rate === null ? "No finalized sessions" : <><span className="font-medium text-foreground tabular-nums">{week.rate}%</span> · {week.attended} of {week.counted} marks</>}</span>
            <span className="text-muted-foreground">{week.sessions} {week.sessions === 1 ? "session" : "sessions"}</span>
          </div> : null;
        }} />
        <Bar dataKey="rate" fill="var(--color-rate)" radius={[5, 5, 0, 0]} maxBarSize={40} isAnimationActive={false} />
      </BarChart>
    </ChartContainer> : <p className="py-10 text-center text-sm text-muted-foreground">No finalized sessions in the last 8 weeks</p>}
  </Card>;
}

function Grades({ data, base }: { data: Overview; base: string }) {
  const max = Math.max(1, ...data.students.levels.map(level => level.total));
  return <Card aria-labelledby="home-students" className="gap-4 rounded-xl p-5 shadow-none">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id="home-students" className={title}>Students by grade</h2>
      <span className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true"><span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-primary" />In person</span><span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[var(--chart-2)]" />Online</span><span>{data.year}–{data.year! + 1}</span></span>
    </div>
    {data.students.total ? <ul className="-mx-2 space-y-1">{data.students.levels.map(level => <li key={level.id}>
      <Link href={`${base}/students?level=${encodeURIComponent(level.id)}`} className={`grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/40 ${focus}`}>
        <span dir="auto" className="truncate text-sm font-medium">{level.name}</span>
        <span className="flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <span className="bg-primary" style={{ width: `${(level.total - level.online) / max * 100}%` }} />
          <span className="bg-[var(--chart-2)]" style={{ width: `${level.online / max * 100}%` }} />
        </span>
        <span className="text-right text-sm tabular-nums"><span className="font-semibold">{level.total}</span><span className="sr-only"> students, </span><span className="block text-xs text-muted-foreground">{level.total - level.online} in person · {level.online} online</span></span>
      </Link>
    </li>)}</ul> : <p className="py-6 text-sm text-muted-foreground">No active students</p>}
  </Card>;
}

function Today({ data, base }: { data: Overview; base: string }) {
  return <Card aria-labelledby="home-today" className="min-w-0 gap-2 rounded-xl p-5 shadow-none">
    <div className="flex items-center justify-between gap-2"><h2 id="home-today" className={title}>Today</h2><Button asChild variant="ghost" size="sm" className="-mr-2"><Link href={`${base}/schedules`}>Schedules<HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.5} aria-hidden="true" /></Link></Button></div>
    {data.today.length ? <ol className="divide-y">{data.today.map((item, index) => <li key={`${item.id}:${item.startsAt}:${index}`} className="flex gap-4 py-3">
      <div className="w-12 shrink-0 text-xs tabular-nums"><span className="block font-medium">{item.startsAt.slice(0, 5)}</span><span className="block text-muted-foreground">{item.endsAt.slice(0, 5)}</span></div>
      <div className="min-w-0 border-l pl-4"><p dir="auto" className="break-words text-sm font-medium">{item.title}</p>{item.location && <p dir="auto" className="mt-0.5 break-words text-xs text-muted-foreground">{item.location}</p>}</div>
    </li>)}</ol> : <p className="py-6 text-sm text-muted-foreground">No classes scheduled today</p>}
    {data.today.length === 12 && <Link href={`${base}/schedules`} className={`inline-block rounded text-sm ${focus}`}>View full schedule</Link>}
  </Card>;
}
