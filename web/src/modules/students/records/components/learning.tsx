"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { loadStaffStudentLearning } from "@/modules/content";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MetricRing } from "./ring";
import { QueryContent } from "@/components/shared/query-content";
import { formatAcademyLong } from "@/lib/academy-time";

export function StudentLearning({academyId,recordId,base}:{academyId:string;recordId:string;base:string}) {
  const [page,setPage]=useState(0);
  const query=useQuery({queryKey:["learning",academyId,"staff-student",recordId,page],queryFn:({signal})=>loadStaffStudentLearning(academyId,recordId,page*24,signal),staleTime:30_000});
  return <section className="space-y-4" aria-labelledby="student-learning"><h2 id="student-learning" className="text-lg font-semibold">Learning journey</h2>
    <QueryContent query={query} label="student learning" isEmpty={data=>!data.total} emptyTitle="No published units for this placement">
      {data=><>
        <dl className="flex flex-wrap gap-x-10 gap-y-4">{[["Published units",data.total],["Started",data.started],["Completed",data.completed]].map(([label,count])=><div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{count}</dd></div>)}</dl>
        <ul className="grid gap-3 sm:grid-cols-2">{data.units.map(unit=>{
          const unfinished=unit.progress.total>0&&unit.progress.completed<unit.progress.total;
          const blocked=unit.access.status==="expired"&&unfinished;
          return <li key={unit.id}><Card className="h-full gap-4 p-5 shadow-none">
            <div className="flex items-center gap-4">
              <MetricRing value={unit.progress.completed} total={unit.progress.total} display={unit.progress.total ? `${unit.progress.completed}/${unit.progress.total}` : "—"} label={`${unit.title}: ${unit.progress.completed} of ${unit.progress.total} required items completed`} />
              <div className="min-w-0 flex-1 space-y-2"><h3 dir="auto" className="break-words font-medium">{unit.title}</h3><Badge variant="secondary">{{active:"Available",locked:"Locked",expired:"Expired",revoked:"Revoked"}[unit.access.status]}</Badge><p className="text-xs text-muted-foreground">{unit.progress.total ? "Required items completed" : "No tracked learning items"}</p></div>
            </div>
            {blocked&&<p className="rounded-lg bg-muted px-3 py-2 text-sm">Access is expired; required items remain incomplete.</p>}
            <div className="mt-auto flex flex-wrap items-center justify-between gap-3">{unit.access.expiresAt&&<span className="text-xs text-muted-foreground">{unit.access.status==="expired"?"Expired":"Access ends"} <time dateTime={unit.access.expiresAt}>{formatAcademyLong(unit.access.expiresAt)}</time></span>}<Button asChild variant="outline" size="sm" className="ml-auto"><Link href={`${base}/content/${unit.id}`}>Open unit</Link></Button></div>
          </Card></li>;
        })}</ul>
        {data.total>24&&<nav aria-label="Student unit pages" className="flex flex-wrap items-center justify-between gap-3"><span className="text-sm text-muted-foreground">{page*24+1}–{Math.min((page+1)*24,data.total)} of {data.total}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={!page||query.isFetching} onClick={()=>setPage(value=>value-1)}>Previous</Button><Button variant="outline" size="sm" disabled={(page+1)*24>=data.total||query.isFetching} onClick={()=>setPage(value=>value+1)}>Next</Button></div></nav>}
      </>}
    </QueryContent>
  </section>;
}
