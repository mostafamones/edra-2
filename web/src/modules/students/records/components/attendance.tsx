"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { Calendar03Icon } from "@hugeicons/core-free-icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { QueryContent } from "@/components/shared/query-content";
import { attendanceInsights, loadStudentAttendance, studentAttendanceSummary } from "@/modules/attendance";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatAcademyLong } from "@/lib/academy-time";

const colors: Record<string, string> = { present: "bg-primary", late: "bg-chart-3", absent: "bg-destructive", excused: "bg-chart-2", unknown: "bg-muted" };
type AttendanceData = Awaited<ReturnType<typeof loadStudentAttendance>>;

export function StudentAttendance({ query, base }: { query: UseQueryResult<AttendanceData, Error>; base: string }) {
  const [history, setHistory] = useState(false);
  const summary = query.data ? studentAttendanceSummary(query.data) : null;
  const recent = query.data?.filter(row => row.mandatory).slice(0, 20).reverse() ?? [];
  const insights = !query.error && query.data ? attendanceInsights(query.data) : [];
  return <Card id="student-attendance" className="scroll-mt-24 gap-0 py-0 shadow-none" aria-labelledby="student-attendance-title">
    <Collapsible open={history} onOpenChange={setHistory}>
      <div className="flex flex-wrap items-center gap-2 border-b p-4 sm:px-5"><HugeiconsIcon icon={Calendar03Icon} size={18} strokeWidth={1.5} aria-hidden="true" /><h2 id="student-attendance-title" className="flex-1 text-base font-semibold">Attendance</h2>{!!query.data?.length && <CollapsibleTrigger asChild><Button variant="ghost" size="sm">{history ? "Hide sessions" : "Session history"}</Button></CollapsibleTrigger>}</div>
      <div className="p-4 sm:p-5">
      <QueryContent query={query} label="attendance" isEmpty={data => !data.length} emptyTitle="No finalized attendance">
        {rows => <>
          {summary && <div className="flex flex-col items-stretch gap-6 sm:flex-row sm:items-center">
            <div className="shrink-0 space-y-1"><p className="font-heading text-2xl font-semibold tabular-nums">{summary.rate === null ? "—" : Math.round(summary.rate) + "%"}</p><p className="text-xs text-muted-foreground">Mandatory attendance</p></div>
            <div className="min-w-0 flex-1 space-y-2">
              {recent.length > 0 && <ol style={{ "--session-count": recent.length, "--mobile-columns": Math.min(10, recent.length) } as CSSProperties} className="grid grid-cols-[repeat(var(--mobile-columns),minmax(0,1fr))] gap-1 sm:grid-cols-[repeat(var(--session-count),minmax(0,1fr))]" aria-label="Recent mandatory sessions, oldest to latest">{recent.map(row => <li key={row.session_id}><Link href={base + "/attendance/" + row.session_id} title={formatAcademyLong(row.session_started_at) + ": " + row.status} aria-label={formatAcademyLong(row.session_started_at) + ": " + row.status} className={"block h-6 rounded-md ring-offset-background transition-opacity hover:opacity-70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " + colors[row.status]} /></li>)}</ol>}
              {recent.length > 0 && <div className="flex justify-between gap-2 text-xs text-muted-foreground"><time dateTime={recent[0].session_started_at}>{formatAcademyLong(recent[0].session_started_at)}</time><time dateTime={recent.at(-1)!.session_started_at}>{formatAcademyLong(recent.at(-1)!.session_started_at)}</time></div>}
              <dl className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">{[["Present", summary.present], ["Late", summary.late], ["Absent", summary.absent], ["Excused", summary.excused]].map(([label, count]) => <div key={label} className="flex items-center gap-1"><dt className="order-2">{String(label).toLowerCase()}</dt><dd className="order-1 tabular-nums">{count}</dd></div>)}</dl>
              {summary.unknown > 0 && <p className="text-xs text-muted-foreground">{summary.unknown} finalized Unknown · excluded from the rate</p>}
            </div>
          </div>}
          {insights.slice(0, 1).map(insight => <Collapsible key={insight.title} className="mt-4 border-t pt-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">{insight.title}</p><CollapsibleTrigger asChild><Button variant="ghost" size="sm">View evidence</Button></CollapsibleTrigger></div><CollapsibleContent><ul className="divide-y">{insight.evidence.map(row => <li key={row.session_id}><Link href={base + "/attendance/" + row.session_id} className="flex flex-wrap justify-between gap-2 rounded py-2 text-xs hover:underline focus-visible:ring-2 focus-visible:ring-ring"><time dateTime={row.session_started_at}>{formatAcademyLong(row.session_started_at)}</time><span className="capitalize">{row.status}</span></Link></li>)}</ul></CollapsibleContent></Collapsible>)}
          <CollapsibleContent className="mt-4"><ul className="divide-y">{rows.slice(0, 20).map(row => <li key={row.session_id}><Link href={base + "/attendance/" + row.session_id} className="flex flex-wrap justify-between gap-2 rounded py-2 text-sm hover:underline focus-visible:ring-2 focus-visible:ring-ring">{formatAcademyLong(row.session_started_at)}<span className="capitalize">{row.status}{!row.mandatory && " · Optional"}</span></Link></li>)}</ul>{rows.length > 20 && <p className="text-xs text-muted-foreground">Showing 20 of {rows.length} finalized sessions</p>}</CollapsibleContent>
        </>}
      </QueryContent>
      </div>
    </Collapsible>
  </Card>;
}
