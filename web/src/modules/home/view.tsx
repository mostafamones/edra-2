"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, StudentsIcon, AssignmentsIcon, BookOpen01Icon, Calendar03Icon, PlayIcon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { QueryContent } from "@/components/shared/query-content";
import type { LiveSession } from "@/modules/sessions";
import type { Overview } from "./overview";

type Read<T> = ComponentProps<typeof QueryContent<T>>["query"];
const focus = "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const kinds = {
  attendance: { label: "Finalize attendance", icon: Calendar03Icon, path: "/attendance/", action: "Review" },
  review: { label: "Unit awaiting publication", icon: BookOpen01Icon, path: "/content/", action: "Review" },
  assignment: { label: "Online assignment submissions to mark", icon: AssignmentsIcon, path: "/assignments/", action: "Mark" },
};

/** Operational overview: bounded actionable work, today's plan and aggregate enrollment. */
export function HomeView({ academyName, base, live, overview }: {
  academyName: string; base: string; live: Read<LiveSession[]>; overview: Read<Overview>;
}) {
  return <main className="page-shell" aria-label={academyName}>
    <header className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Home</h1>
      <Button asChild><Link href={`${base}/attendance/new`}><HugeiconsIcon icon={PlayIcon} strokeWidth={1.5} aria-hidden="true" />Start session</Link></Button>
    </header>

    <QueryContent query={overview} label="academy overview" isEmpty={() => false} emptyTitle="No overview">
      {data => <>
        {data.year === null ? <Card className="p-5 font-medium">No open academic year</Card> : <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { label: "Active students", value: data.students.total, href: `${base}/students`, icon: StudentsIcon },
              { label: "Online students", value: data.students.online, href: `${base}/students?type=online_only`, icon: BookOpen01Icon },
            ].map(item => <Card key={item.label} className="gap-3 rounded-xl p-5 shadow-none">
              <span className="flex items-center justify-between text-sm text-muted-foreground">{item.label}<HugeiconsIcon icon={item.icon} strokeWidth={1.5} className="size-4" aria-hidden="true" /></span>
              <Link href={item.href} className={`flex items-end justify-between rounded-sm ${focus}`}><span className="font-heading text-3xl font-semibold tabular-nums tracking-tight">{item.value}</span><HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.5} className="size-4 text-muted-foreground" aria-hidden="true" /><span className="sr-only">View {item.label.toLowerCase()}</span></Link>
            </Card>)}
            <Card className="gap-3 rounded-xl bg-muted/30 p-5 shadow-none"><span className="text-sm text-muted-foreground">Needs attention</span><span className="font-heading text-3xl font-semibold tabular-nums tracking-tight">{data.attentionCount}</span></Card>
          </div>

          <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <section aria-labelledby="home-attention" className="min-w-0 space-y-4">
              <h2 id="home-attention" className="font-heading text-lg font-semibold">Needs attention</h2>
              {data.attention.length ? <Card className="gap-0 overflow-hidden rounded-xl py-0 shadow-none">
                <ul className="divide-y">{data.attention.map(item => {
                  const kind = kinds[item.kind];
                  return <li key={`${item.kind}:${item.id}`}><Link href={`${base}${kind.path}${item.id}`} className={`group flex items-center gap-4 p-4 transition-colors hover:bg-muted/40 sm:p-5 ${focus}`}>
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted"><HugeiconsIcon icon={kind.icon} strokeWidth={1.5} className="size-5 text-muted-foreground" aria-hidden="true" /></span>
                    <span className="min-w-0 flex-1 space-y-1"><span dir="auto" className="block break-words text-sm font-medium">{item.title}</span><span className="block text-xs text-muted-foreground">{kind.label}{item.kind === "assignment" ? ` · ${item.amount}` : ""}</span></span>
                    <span className="flex shrink-0 items-center gap-2 text-sm"><span className="hidden sm:inline">{kind.action}</span><HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.5} className="size-4 text-muted-foreground" aria-hidden="true" /></span>
                  </Link></li>;
                })}</ul>
                {data.attentionCount > data.attention.length && <p className="border-t px-5 py-3 text-xs text-muted-foreground">Showing the oldest {data.attention.length} of {data.attentionCount} items</p>}
              </Card> : <Card className="items-center gap-3 rounded-xl border-dashed px-5 py-12 text-center shadow-none"><HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={1.5} className="size-7 text-muted-foreground" aria-hidden="true" /><p className="font-medium">All caught up</p></Card>}
            </section>

            <section aria-labelledby="home-today" className="min-w-0 space-y-4">
              <div className="flex items-center justify-between gap-2"><h2 id="home-today" className="font-heading text-lg font-semibold">Today</h2><Button asChild variant="ghost" size="sm"><Link href={`${base}/schedules`}>Schedules<HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.5} aria-hidden="true" /></Link></Button></div>
              <QueryContent query={live} label="live sessions" isEmpty={() => false} emptyTitle="No live sessions" loading={<p className="text-sm text-muted-foreground">Loading live sessions…</p>}>
                {items => items.length ? <ul className="space-y-2">{items.map(session => <li key={session.id}><Link href={`${base}/attendance/${session.id}`} className={`flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 ${focus}`}><span className="min-w-0 flex-1 space-y-1"><Badge variant="secondary">Live</Badge><span dir="auto" className="block break-words text-sm font-medium">{session.scheduleTitle}</span></span><HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.5} className="size-4 shrink-0" aria-hidden="true" /></Link></li>)}</ul> : <p className="text-xs text-muted-foreground">No live sessions</p>}
              </QueryContent>
              {data.today.length ? <ol className="divide-y">{data.today.map((item,index) => <li key={`${item.id}:${item.startsAt}:${index}`} className="flex gap-4 py-4">
                <div className="w-14 shrink-0 space-y-1 text-xs tabular-nums"><span className="block font-medium">{item.startsAt.slice(0,5)}</span><span className="block text-muted-foreground">{item.endsAt.slice(0,5)}</span></div>
                <div className="min-w-0 border-l pl-4"><p dir="auto" className="break-words text-sm font-medium">{item.title}</p>{item.location && <p dir="auto" className="mt-1 break-words text-xs text-muted-foreground">{item.location}</p>}</div>
              </li>)}</ol> : <p className="py-4 text-sm text-muted-foreground">No classes scheduled today</p>}
              {data.today.length === 12 && <Link href={`${base}/schedules`} className={`inline-block rounded text-sm ${focus}`}>View full schedule</Link>}
            </section>
          </div>

          <section aria-labelledby="home-students" className="space-y-4">
            <div className="flex items-center justify-between gap-2"><h2 id="home-students" className="font-heading text-lg font-semibold">Students by grade</h2><span className="text-xs text-muted-foreground">{data.year}–{data.year + 1}</span></div>
            <Card className="gap-0 rounded-xl py-0 shadow-none">
              {data.students.total ? <ul className="divide-y px-5">{data.students.levels.map(level => <li key={level.id}><Link href={`${base}/students?level=${encodeURIComponent(level.id)}`} className={`group flex items-center gap-4 rounded-lg py-5 ${focus}`}>
                <span className="min-w-0 flex-1 space-y-1.5"><span dir="auto" className="block break-words text-sm font-medium">{level.name}</span><span className="block text-xs text-muted-foreground">{level.total - level.online} in person · {level.online} online</span></span>
                <span className="shrink-0 text-right"><span className="block text-xl font-semibold tabular-nums">{level.total}</span><span className="text-xs text-muted-foreground">students</span></span>
                <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.5} className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link></li>)}</ul> : <div className="p-6 text-sm text-muted-foreground">No active students</div>}
            </Card>
          </section>
        </>}
      </>}
    </QueryContent>
  </main>;
}
