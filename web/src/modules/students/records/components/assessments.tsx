"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { Task01Icon } from "@hugeicons/core-free-icons";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QueryContent } from "@/components/shared/query-content";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatAcademyLong } from "@/lib/academy-time";
import { awaitingMarking, studentAssessmentOptions, type StudentAssessmentData } from "../overview";
import { ResultsChart } from "./results-chart";

const paths = { assignment: "assignments", quiz: "quizzes", exam: "exams" };
const workLabels: Record<string, string> = { expected: "Awaiting submission", not_received: "Not submitted", submitted: "Submitted", late: "Submitted late", in_progress: "In progress", excused: "Excused", missing: "Missing" };

export function StudentAssessments({ academyId, recordId, base }: { academyId: string; recordId: string; base: string }) {
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(0);
  const query = useQuery(studentAssessmentOptions(academyId, recordId));
  const laterPage = useQuery({ ...studentAssessmentOptions(academyId, recordId, page || 1), enabled: expanded && page > 0 });
  const current = page > 0 ? laterPage : query;
  const pending = awaitingMarking(query.data?.items ?? []).slice(0, 2);

  return <Card className="gap-0 py-0 shadow-none" aria-labelledby="student-assessments">
    <Collapsible open={expanded} onOpenChange={value => { setExpanded(value); setPage(0); }}>
      <div className="flex flex-wrap items-center gap-2 border-b p-4 sm:px-5"><HugeiconsIcon icon={Task01Icon} size={18} strokeWidth={1.5} aria-hidden="true" /><h2 id="student-assessments" className="flex-1 text-base font-semibold">Assessments</h2>{!!query.data?.total && <CollapsibleTrigger asChild><Button size="sm" variant="ghost">{expanded ? "Hide records" : "View all records"}</Button></CollapsibleTrigger>}</div>
      <div className="p-4 sm:p-5">
      <QueryContent query={query} label="student assessments" isEmpty={data => !data.total} emptyTitle="No assessment records">
        {data => <>
          <ResultsChart items={data.items} base={base} sampled={data.total > data.items.length} />
          {data.total > data.items.length && <p className="mt-2 text-xs text-muted-foreground">Results from the {data.items.length} most recently created assessment records</p>}
          {pending.length > 0 && <ul className="mt-4 divide-y border-t">{pending.map(item => <li key={item.kind + ":" + item.id} className="flex flex-wrap items-center gap-3 pt-4 not-last:pb-4"><div className="min-w-0 flex-1 space-y-1"><h3 dir="auto" className="break-words font-sans text-sm font-semibold">{item.title}</h3><p className="text-xs text-muted-foreground">{item.kind === "assignment" ? "Assignment" : item.kind === "quiz" ? "Quiz" : "Exam"} · {workLabels[item.work!] ?? item.work}</p></div><Badge variant="secondary">{item.score === null ? "Awaiting marking" : "Marking incomplete"}</Badge><Button asChild variant="ghost" size="sm"><Link aria-label={"Review work: " + item.title} href={base + "/" + paths[item.kind] + "/" + item.id}>Review work</Link></Button></li>)}</ul>}
        </>}
      </QueryContent>
      <CollapsibleContent className="mt-4 border-t pt-4">
        <QueryContent query={current} label="assessment records" isEmpty={data => !data.total} emptyTitle="No assessment records">
          {data => <><ul className="divide-y">{data.items.map(item => <AssessmentRecord key={item.kind + ":" + item.id} item={item} base={base} />)}</ul>{data.total > 24 && <nav aria-label="Student assessment pages" className="mt-4 flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-muted-foreground">{page * 24 + 1}–{Math.min((page + 1) * 24, data.total)} of {data.total}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={!page || current.isFetching} onClick={() => setPage(value => value - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={(page + 1) * 24 >= data.total || current.isFetching} onClick={() => setPage(value => value + 1)}>Next</Button></div></nav>}</>}
        </QueryContent>
      </CollapsibleContent>
      </div>
    </Collapsible>
  </Card>;
}

function AssessmentRecord({ item, base }: { item: StudentAssessmentData["items"][number]; base: string }) {
  return <li className="space-y-3 py-4 first:pt-0">
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0 space-y-1"><Link dir="auto" className="break-words rounded text-sm font-semibold hover:underline focus-visible:ring-2 focus-visible:ring-ring" href={base + "/" + paths[item.kind] + "/" + item.id}>{item.title}</Link><p className="text-xs capitalize text-muted-foreground">{item.kind}</p></div><Badge variant="secondary">{item.work ? workLabels[item.work] ?? item.work.replaceAll("_", " ") : "No work recorded"}</Badge></div>
    <dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">Private marking</dt><dd className="mt-1 tabular-nums">{item.score === null ? "Not marked" : item.score + (item.maximum ? " / " + item.maximum : "") + (item.complete ? "" : " · Incomplete")}</dd></div><div><dt className="text-xs text-muted-foreground">Announced result</dt><dd className="mt-1 tabular-nums">{item.publication ? item.publication.total + (item.publication.max_score ? " / " + item.publication.max_score : "") : "Not announced"}</dd>{item.publication && <p className="mt-1 text-xs text-muted-foreground">{formatAcademyLong(item.publication.published_at)}</p>}</div></dl>
    {item.publicationState === "pending_correction" && <p className="rounded-lg bg-muted px-3 py-2 text-xs">Private changes differ from the announced result.</p>}
  </li>;
}
