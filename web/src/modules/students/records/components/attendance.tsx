"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { attendanceInsights, loadStudentAttendance, studentAttendanceSummary } from "@/modules/attendance";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatAcademyLong } from "@/lib/academy-time";
import { MetricRing } from "./ring";
const colors:Record<string,string>={present:"bg-primary",late:"bg-chart-3",absent:"bg-destructive",excused:"bg-chart-2",unknown:"bg-muted"};

export function StudentAttendance({academyId,yearId,recordId,base}:{academyId:string;yearId:string;recordId:string;base:string}) {
  const query=useQuery({queryKey:["attendance",academyId,"student",yearId,recordId],queryFn:({signal})=>loadStudentAttendance(academyId,yearId,recordId,signal),staleTime:30_000});
  const summary=query.data?studentAttendanceSummary(query.data):null;
  const recent=query.data?.filter(row=>row.mandatory).slice(0,20).reverse()??[];
  const insights=query.data?attendanceInsights(query.data):[];
  return <Card className="h-fit gap-5 p-5 shadow-none" aria-labelledby="student-attendance">
    <h2 id="student-attendance" className="text-lg font-semibold">Attendance</h2>
    {query.isPending&&<p role="status">Loading attendance…</p>}
    {query.isError&&<div role="alert" className="flex flex-wrap items-center gap-3 text-sm">Couldn’t refresh attendance.<Button size="sm" variant="outline" onClick={()=>void query.refetch()}>Retry</Button></div>}
    {summary&&<>
      <div className="flex flex-wrap items-center gap-5"><MetricRing value={summary.present+summary.late} total={summary.present+summary.late+summary.absent} display={summary.rate===null?"—":`${Math.round(summary.rate)}%`} label={summary.rate===null?"No counted attendance":`${Math.round(summary.rate)}% mandatory attendance`} />
        <dl className="grid flex-1 grid-cols-2 gap-x-5 gap-y-3">{[["Present",summary.present],["Late",summary.late],["Absent",summary.absent],["Excused",summary.excused]].map(([label,count])=><div key={label}><dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><span aria-hidden="true" className={`size-1.5 rounded-full ${colors[String(label).toLowerCase()]}`} />{label}</dt><dd className="text-lg font-semibold tabular-nums">{count}</dd></div>)}</dl>
      </div>
      {recent.length>0&&<div className="space-y-2"><p className="text-xs text-muted-foreground">Recent mandatory sessions</p><ol className="grid grid-cols-10 gap-1.5" aria-label="Attendance over time">{recent.map(row=><li key={row.session_id}><Link href={`${base}/attendance/${row.session_id}`} aria-label={`${formatAcademyLong(row.session_started_at)}: ${row.status}`} className={`block aspect-square rounded-md ring-offset-background transition-opacity hover:opacity-70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${colors[row.status]}`} /></li>)}</ol><div className="flex justify-between text-xs text-muted-foreground"><span>Older</span><span>Latest</span></div></div>}
      {!query.isError&&insights.slice(0,1).map(insight=><Collapsible key={insight.title} className="border-t pt-4"><p className="text-sm font-medium">{insight.title}</p><CollapsibleTrigger asChild><Button variant="ghost" size="sm" className="-ml-2 mt-1">View evidence</Button></CollapsibleTrigger><CollapsibleContent><ul className="divide-y">{insight.evidence.map(row=><li key={row.session_id}><Link href={`${base}/attendance/${row.session_id}`} className="flex flex-wrap justify-between gap-2 rounded py-2 text-xs hover:underline focus-visible:ring-2 focus-visible:ring-ring"><time dateTime={row.session_started_at}>{formatAcademyLong(row.session_started_at)}</time><span className="capitalize">{row.status}</span></Link></li>)}</ul></CollapsibleContent></Collapsible>)}
      {summary.unknown>0&&<p className="text-xs text-muted-foreground">{summary.unknown} finalized Unknown · excluded from the rate</p>}
      {!!query.data?.length&&<Collapsible className="border-t pt-3"><CollapsibleTrigger asChild><Button size="sm" variant="outline">Session history</Button></CollapsibleTrigger><CollapsibleContent><ul className="mt-3 divide-y">{query.data.slice(0,20).map(row=><li key={row.session_id}><Link href={`${base}/attendance/${row.session_id}`} className="flex flex-wrap justify-between gap-2 rounded py-2 text-sm hover:underline focus-visible:ring-2 focus-visible:ring-ring">{formatAcademyLong(row.session_started_at)}<span className="capitalize">{row.status}{!row.mandatory&&" · Optional"}</span></Link></li>)}</ul>{query.data.length>20&&<p className="text-xs text-muted-foreground">Showing 20 of {query.data.length} finalized sessions</p>}</CollapsibleContent></Collapsible>}
    </>}
  </Card>;
}
