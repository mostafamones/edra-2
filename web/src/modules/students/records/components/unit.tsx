"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { BookOpen01Icon, LockKeyIcon, Task01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { QueryContent } from "@/components/shared/query-content";
import { loadStaffUnitMaterials } from "@/modules/content";
import { formatAcademyLong } from "@/lib/academy-time";
import { unitCompleted, type StudentUnit } from "../overview";

const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Cairo" });
const labels = { active: "Available", locked: "Locked", expired: "Expired", revoked: "Revoked" };

export function StudentUnitItem({ unit, academyId, base }: { unit: StudentUnit; academyId: string; base: string }) {
  const [open, setOpen] = useState(false);
  const materials = useQuery({ queryKey: ["content", academyId, "unit", unit.id, "published-materials"], queryFn: ({ signal }) => loadStaffUnitMaterials(academyId, unit.id, signal), enabled: open, staleTime: 60_000 });
  const { status, expiresAt } = unit.access;
  const count = unit.progress.total ? `${unit.progress.completed} / ${unit.progress.total} completed` : "No tracked items";
  const groups = [
    { kind: "explanation", title: "Explanation videos", icon: BookOpen01Icon },
    { kind: "assessment", title: "Assessments", icon: Task01Icon },
  ];

  return <Collapsible open={open} onOpenChange={setOpen}>
    <div className={`grid min-w-0 items-center gap-x-4 gap-y-3 rounded-lg px-3 py-4 md:grid-cols-[minmax(0,1fr)_9rem_10rem_8rem] ${open ? "bg-muted/60" : ""}`}>
      <h3 dir="auto" className="flex min-w-0 items-center gap-2 break-words font-sans text-sm font-semibold">
        <HugeiconsIcon icon={unitCompleted(unit) ? Tick02Icon : status === "locked" ? LockKeyIcon : BookOpen01Icon} size={18} strokeWidth={1.5} className={`hidden shrink-0 md:block ${unitCompleted(unit) ? "text-chart-2" : "text-muted-foreground"}`} aria-hidden="true" />
        <span className="min-w-0 break-words">{unit.title}</span>
      </h3>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs md:block md:space-y-1">
        <Badge variant="secondary" className={status === "active" ? "text-chart-2" : status === "expired" || status === "revoked" ? "text-destructive" : undefined}>{labels[status]}</Badge>
        <p className="text-muted-foreground">{expiresAt ? <time dateTime={expiresAt} title={formatAcademyLong(expiresAt)}>{status === "expired" ? "Expired " : "Until "}{date.format(new Date(expiresAt))}</time> : status === "locked" ? "Not unlocked" : status === "revoked" ? "Access revoked" : "No expiry recorded"}</p>
      </div>
      <div className="space-y-2"><p className="text-xs tabular-nums text-muted-foreground">{count}</p>{unit.progress.total > 0 && <Progress aria-label={`${unit.title} completion`} value={unit.progress.completed / unit.progress.total * 100} aria-valuenow={Math.round(unit.progress.completed / unit.progress.total * 100)} aria-valuetext={count} className="h-1.5" />}</div>
      <CollapsibleTrigger asChild><Button variant="ghost" size="sm" className="justify-self-end" aria-label={`${open ? "Hide" : "View"} progress: ${unit.title}`}>{open ? "Hide progress" : "View progress"}</Button></CollapsibleTrigger>
    </div>
    <CollapsibleContent className="pb-3">
      <div className="space-y-4 rounded-lg bg-background/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><p dir="auto" className="min-w-0 break-words text-sm font-semibold">{unit.title}</p><Button asChild variant="ghost" size="sm"><Link href={`${base}/content/${unit.id}`} aria-label={`Open unit: ${unit.title}`}>Open unit</Link></Button></div>
        <QueryContent query={materials} label="published materials" isEmpty={() => !unit.progress.items.length} emptyTitle="No tracked learning items">
          {items => <div className="grid gap-5 lg:grid-cols-2">{groups.map(group => {
            const rows = unit.progress.items.flatMap(progress => {
              const item = items.find(item => item.id === progress.itemId && item.kind === group.kind);
              return item ? [{ ...progress, title: item.title }] : [];
            });
            return rows.length > 0 && <section key={group.kind} className="min-w-0 space-y-2" aria-label={group.title}><h4 className="text-xs text-muted-foreground">{group.title}</h4><ul className="space-y-1">{rows.map(item => {
              const watched = item.watchedSeconds ?? 0;
              const percent = item.durationSeconds ? Math.min(99, Math.floor(watched / item.durationSeconds * 100)) : null;
              const state = item.completed ? group.kind === "assessment" ? "Submitted" : "Completed" : group.kind === "assessment" ? "Not submitted" : watched > 0 ? percent !== null ? `${percent}% watched` : "Started" : "Not started";
              return <li key={item.itemId} className="flex items-start gap-2 py-2 text-sm"><HugeiconsIcon icon={item.completed ? Tick02Icon : group.icon} size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" /><span dir="auto" className="min-w-0 flex-1 break-words">{item.title}</span><span className={`max-w-28 shrink-0 text-right text-xs ${item.completed ? "text-chart-2" : "text-muted-foreground"}`}>{state}</span></li>;
            })}</ul></section>;
          })}
          {unit.progress.items.some(progress => !items.some(item => item.id === progress.itemId)) && <p role="status" className="text-sm text-muted-foreground">Published materials changed. Refresh the unit list to update progress.</p>}</div>}
        </QueryContent>
      </div>
    </CollapsibleContent>
  </Collapsible>;
}
