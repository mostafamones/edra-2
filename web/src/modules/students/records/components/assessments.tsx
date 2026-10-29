"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { loadStudentAssessments } from "@/modules/assessments";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QueryContent } from "@/components/shared/query-content";
import { ResultsChart } from "./results-chart";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatAcademyLong } from "@/lib/academy-time";
const paths={assignment:"assignments",quiz:"quizzes",exam:"exams"};
const workLabels:Record<string,string>={expected:"Awaiting submission",not_received:"Not submitted",submitted:"Submitted",late:"Submitted late",in_progress:"In progress",excused:"Excused",missing:"Missing"};

export function StudentAssessments({academyId,recordId,base}:{academyId:string;recordId:string;base:string}) {
  const [page,setPage]=useState(0);
  // Like the staff assessment list, returning from marking revalidates the current result.
  const query=useQuery({queryKey:["assessments",academyId,"student",recordId,page],queryFn:({signal})=>loadStudentAssessments(academyId,recordId,page*24,signal),staleTime:0});
  return <Card className="h-fit gap-5 p-5 shadow-none" aria-label="Assessment results">
    <QueryContent query={query} label="student assessments" isEmpty={data=>!data.total} emptyTitle="No assessment records">
      {data=><><ResultsChart items={data.items} /><Collapsible><CollapsibleTrigger asChild><Button variant="outline" size="sm">View assessment records</Button></CollapsibleTrigger><CollapsibleContent className="mt-4"><ul className="space-y-3">{data.items.map(item=><li key={`${item.kind}:${item.id}`}><Card className="gap-4 p-5 shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 space-y-1"><Link href={`${base}/${paths[item.kind]}/${item.id}`} dir="auto" className="break-words rounded font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring">{item.title}</Link><p className="text-xs capitalize text-muted-foreground">{item.kind}</p></div><Badge variant="secondary">{item.work ? workLabels[item.work]??item.work.replaceAll("_"," ") : "No work recorded"}</Badge></div>
        <dl className="grid gap-4 sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">Private marking</dt><dd className="mt-1 text-sm tabular-nums">{item.score===null?"Not marked":`${item.score}${item.maximum?` / ${item.maximum}`:""}${item.complete?"":" · Incomplete"}`}</dd></div><div><dt className="text-xs text-muted-foreground">Announced result</dt><dd className="mt-1 text-sm tabular-nums">{item.publication?`${item.publication.total}${item.publication.max_score?` / ${item.publication.max_score}`:""}`:"Not announced"}</dd>{item.publication&&<p className="mt-1 text-xs text-muted-foreground">{formatAcademyLong(item.publication.published_at)}</p>}</div></dl>
        {item.publicationState==="pending_correction"&&<p className="rounded-lg bg-muted px-3 py-2 text-sm">Private changes differ from the announced result.</p>}
      </Card></li>)}</ul><nav aria-label="Student assessment pages" className="flex flex-wrap justify-between gap-3"><span className="text-sm text-muted-foreground">{page*24+1}–{Math.min((page+1)*24,data.total)} of {data.total}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={!page||query.isFetching} onClick={()=>setPage(p=>p-1)}>Previous</Button><Button size="sm" variant="outline" disabled={(page+1)*24>=data.total||query.isFetching} onClick={()=>setPage(p=>p+1)}>Next</Button></div></nav></CollapsibleContent></Collapsible></>}
    </QueryContent>
  </Card>;
}
