import type { ComponentProps } from "react";
import { QueryContent } from "@/components/shared/query-content";
import { Card } from "@/components/ui/card";
import { ACADEMY_TIME_ZONE } from "@/lib/academy-time";
import type { LiveSession } from "@/modules/sessions";
import type { Overview } from "./overview";
import { HomeStats } from "./components/stats";
import { AttendanceTrend } from "./components/trend";
import { HomeAlerts } from "./components/alerts";
import { StudentsToWatch } from "./components/watch";
import { RecentSessions } from "./components/recent";
import { AssignmentPerformance } from "./components/assignments";

const today = new Intl.DateTimeFormat("en-GB", { timeZone: ACADEMY_TIME_ZONE, weekday: "long", day: "numeric", month: "long" });

type Read<T> = ComponentProps<typeof QueryContent<T>>["query"];

/** Staff dashboard; the only full-width page. Live sessions fail independently of the overview. */
export function HomeView({ name, academyName, base, live, overview }: {
  name?: string | null; academyName: string; base: string; live: Read<LiveSession[]>; overview: Read<Overview>;
}) {
  return <main className="page-shell max-w-none" aria-label={academyName}>
    <header className="space-y-1">
      <p className="text-sm text-muted-foreground">{today.format(new Date())}</p>
      <h1 dir="auto" className="font-heading text-2xl font-semibold tracking-tight">Welcome back{name ? `, ${name.split(/\s+/)[0]}` : ""}</h1>
    </header>
    {live.error && <QueryContent query={live} label="live sessions" isEmpty={() => false} emptyTitle="No live sessions">{() => null}</QueryContent>}
    <QueryContent query={overview} label="academy overview" isEmpty={() => false} emptyTitle="No overview">
      {data => data.year === null ? <Card className="p-5 font-medium">No open academic year</Card> : <>
        <HomeStats data={data} base={base} />
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="min-w-0 xl:col-span-2">{data.attendance && <AttendanceTrend weeks={data.attendance} />}</div>
          <div className="flex min-w-0 flex-col gap-4">
            {/* An empty alert card only takes space from the watch list; failed live reads already show their own error. */}
            {data.attentionCount + (live.data?.length ?? 0) > 0 && <HomeAlerts data={data} live={live.data ?? null} base={base} />}
            {data.watch && <StudentsToWatch students={data.watch} base={base} />}
          </div>
        </div>
        {/* auto-fit lets either card take the full row when the other is not reported */}
        <div className="grid gap-4 xl:grid-cols-[repeat(auto-fit,minmax(0,1fr))]">
          {data.assignments && <AssignmentPerformance items={data.assignments} base={base} />}
          {data.recent && <RecentSessions sessions={data.recent} base={base} />}
        </div>
      </>}
    </QueryContent>
  </main>;
}
