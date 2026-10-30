"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircleIcon, Books01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { QueryContent } from "@/components/shared/query-content";
import { expiredUnfinishedUnit, learningPreview, studentLearningOptions, type StudentLearningData } from "../overview";
import { StudentUnitItem } from "./unit";

const statuses = { all: "All", active: "Available", expired: "Expired", locked: "Locked", revoked: "Revoked" };

export function StudentLearning({ academyId, recordId, base, query, placement = "" }: { academyId: string; recordId: string; base: string; query: UseQueryResult<StudentLearningData, Error>; placement?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<keyof typeof statuses>("all");
  const laterPage = useQuery({ ...studentLearningOptions(academyId, recordId, page || 1, placement), enabled: page > 0 });
  const current = page > 0 ? laterPage : query;
  const filtered = Boolean(search.trim()) || status !== "all";
  const expired = !current.error ? expiredUnfinishedUnit(current.data?.units ?? []) : undefined;
  const clear = () => { setSearch(""); setStatus("all"); };

  return <Card className="gap-0 py-0 shadow-none" aria-labelledby="student-learning">
    <div className="flex flex-wrap items-center gap-2 border-b p-4 sm:px-5">
      <HugeiconsIcon icon={Books01Icon} size={18} strokeWidth={1.5} aria-hidden="true" /><h2 id="student-learning" className="flex-1 text-base font-semibold">Units</h2>
      {query.data && <Badge variant="secondary">{query.data.total}</Badge>}
      {query.data?.total !== 0 && <div className="relative w-full sm:ml-3 sm:w-60"><HugeiconsIcon icon={Search01Icon} size={16} strokeWidth={1.5} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input aria-label={query.data && query.data.total > 24 ? "Search loaded units" : "Search units"} placeholder="Search units" className="pl-9" value={search} onChange={event => setSearch(event.target.value)} /></div>}
    </div>
    <div className="space-y-4 p-4 sm:px-5">
      {expired && <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3"><HugeiconsIcon icon={AlertCircleIcon} size={16} strokeWidth={1.5} aria-hidden="true" className="shrink-0 text-muted-foreground" /><p className="min-w-0 flex-1 break-words text-xs">{expired.title} expired · {expired.progress.total - expired.progress.completed} items unfinished</p><Button asChild variant="ghost" size="sm"><Link href={`${base}/content/${expired.id}`}>Review access</Link></Button></div>}
      {!!query.data?.total && <div className="space-y-2"><div className="flex flex-wrap items-center justify-between gap-2 text-xs"><p className="font-semibold">{query.data.completed} of {query.data.total} units completed</p><span className="text-muted-foreground">{query.data.started} started</span></div>{query.data.total > 0 && <Progress aria-label="Published units completed" value={query.data.completed / query.data.total * 100} aria-valuenow={Math.round(query.data.completed / query.data.total * 100)} aria-valuetext={`${query.data.completed} of ${query.data.total} units completed`} className="h-1.5" />}</div>}
      {!!current.data?.total && <div className="flex flex-wrap gap-1" role="group" aria-label="Unit access filters">{(Object.entries(statuses) as [keyof typeof statuses, string][]).filter(([value]) => value !== "revoked" || status === "revoked" || current.data?.units.some(unit => unit.access.status === "revoked")).map(([value, label]) => <Button key={value} size="sm" variant={status === value ? "secondary" : "outline"} aria-pressed={status === value} className="h-8 gap-1 rounded-full px-2 text-xs" onClick={() => setStatus(value)}>{label}<span className="tabular-nums text-muted-foreground">{current.data ? value === "all" ? current.data.units.length : current.data.units.filter(unit => unit.access.status === value).length : "—"}</span></Button>)}</div>}
      <QueryContent query={current} label="student learning" isEmpty={data => !data.total} emptyTitle="No published units for this placement">
        {data => {
          const preview = learningPreview(data.units);
          const previewUnits = [...preview.unfinished, ...preview.completed];
          const units = (data.total <= 24 || expanded || page > 0 || filtered ? data.units : previewUnits).filter(unit => (status === "all" || unit.access.status === status) && unit.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
          return <>
            {data.total > 24 && <p className="text-xs text-muted-foreground">Filters cover loaded units · {page * 24 + 1}–{Math.min((page + 1) * 24, data.total)} of {data.total}</p>}
            {!units.length ? <Empty><EmptyHeader><EmptyTitle>No matching units</EmptyTitle></EmptyHeader><EmptyContent><Button variant="outline" size="sm" onClick={clear}>Clear filters</Button></EmptyContent></Empty> : <>
              <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1fr)_9rem_10rem_8rem] gap-4 rounded-lg bg-muted/40 px-3 py-3 text-xs text-muted-foreground md:grid"><span>Unit</span><span>Access</span><span>Progress</span><span /></div>
              <ul className="divide-y">{units.map(unit => <li key={unit.id} className="min-w-0"><StudentUnitItem unit={unit} academyId={academyId} base={base} /></li>)}</ul>
            </>}
            <div className="flex flex-wrap items-center justify-end gap-2">{(expanded || page > 0 || data.total > 24) && <Button size="sm" variant="ghost" onClick={() => { setExpanded(value => !value); setPage(0); clear(); }}>{expanded || page > 0 ? "Show fewer" : "View all"}</Button>}{(expanded || page > 0) && data.total > 24 && <nav aria-label="Student unit pages" className="flex gap-2"><Button variant="outline" size="sm" disabled={!page || current.isFetching} onClick={() => setPage(value => value - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={(page + 1) * 24 >= data.total || current.isFetching} onClick={() => { setPage(value => value + 1); clear(); }}>Next</Button></nav>}</div>
          </>;
        }}
      </QueryContent>
    </div>
  </Card>;
}
