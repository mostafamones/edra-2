import type { ComponentProps } from "react";
import { QueryContent } from "@/components/shared/query-content";
import { Card } from "@/components/ui/card";
import type { LiveSession } from "@/modules/sessions";
import type { Overview } from "./overview";
import { HomeStats } from "./components/stats";
import { AttendanceTrend } from "./components/trend";
import { HomeAlerts } from "./components/alerts";
import { StudentsToWatch } from "./components/watch";
import { RecentSessions } from "./components/recent";
import { StudentsByGrade } from "./components/grades";
import { AssignmentPerformance } from "./components/assignments";

type Read<T> = ComponentProps<typeof QueryContent<T>>["query"];

/** Staff dashboard; the only full-width page. Live sessions fail independently of the overview. */
export function HomeView({ academyName, base, live, overview }: {
  academyName: string; base: string; live: Read<LiveSession[]>; overview: Read<Overview>;
}) {
  return <main className="page-shell max-w-none" aria-label={academyName}>
    <h1 className="sr-only">Home</h1>
    {live.error && <QueryContent query={live} label="live sessions" isEmpty={() => false} emptyTitle="No live sessions">{() => null}</QueryContent>}
    <QueryContent query={overview} label="academy overview" isEmpty={() => false} emptyTitle="No overview">
      {data => data.year === null ? <Card className="p-5 font-medium">No open academic year</Card> : <>
        <HomeStats data={data} base={base} />
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="min-w-0 xl:col-span-2">{data.attendance ? <AttendanceTrend weeks={data.attendance} /> : <StudentsByGrade data={data} base={base} />}</div>
          <div className="flex min-w-0 flex-col gap-4">
            <HomeAlerts data={data} live={live.data ?? null} base={base} />
          </div>
          {data.assignments && <div className="min-w-0 xl:col-span-2"><AssignmentPerformance items={data.assignments} base={base} /></div>}
          {data.watch && <StudentsToWatch students={data.watch} base={base} />}
          {data.recent && <div className="min-w-0 xl:col-span-2"><RecentSessions sessions={data.recent} base={base} /></div>}
          {data.attendance && <StudentsByGrade data={data} base={base} />}
        </div>
      </>}
    </QueryContent>
  </main>;
}
