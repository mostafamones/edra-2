"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircleIcon, ArrowDown01Icon, Clock01Icon } from "@hugeicons/core-free-icons";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { FloatingSheet, FloatingSheetContent, FloatingSheetDescription, FloatingSheetHeader, FloatingSheetTitle, FloatingSheetTrigger } from "@/components/ui/floating-sheet";
import { loadUnitHistory } from "../actions";
import type { UnitHistory } from "../data";
import { historyEntries, historyTime, type HistoryEntry } from "../revisions";
import { unwrapContent } from "../types";

/** Every stored draft and publication of a unit, newest first, with who made it, when, and what changed. */
export function VersionHistory({ academyId, unitId, live }: { academyId: string; unitId: string; live: boolean }) {
  const [open, setOpen] = useState(false);
  const query = useQuery({ queryKey: ["content", academyId, "unit", unitId, "history"], enabled: open, queryFn: async () => {
    const history = unwrapContent(await loadUnitHistory(academyId, unitId));
    return historyEntries(history.drafts, history.revisions);
  } });
  const liveKey = live ? query.data?.find(entry => entry.kind === "published")?.key : undefined;
  const withYear = new Set(query.data?.map(entry => new Date(entry.at).getFullYear())).size > 1;
  return <FloatingSheet open={open} onOpenChange={setOpen}>
    <FloatingSheetTrigger asChild><Button variant="outline"><HugeiconsIcon icon={Clock01Icon} strokeWidth={1.5} aria-hidden="true" />History</Button></FloatingSheetTrigger>
    <FloatingSheetContent className="gap-0">
      <FloatingSheetHeader className="border-b">
        <FloatingSheetTitle className="text-lg font-semibold">Version history</FloatingSheetTitle>
        <FloatingSheetDescription className={query.data ? undefined : "sr-only"}>{query.data ? `${query.data.length} entr${query.data.length === 1 ? "y" : "ies"}` : "Drafts and publications of this unit"}</FloatingSheetDescription>
      </FloatingSheetHeader>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {query.isPending ? <div role="status" aria-label="Loading history" className="space-y-6">{[0, 1, 2].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}</div>
          : query.isError ? <div role="alert" className="flex flex-col items-start gap-3 text-sm"><p className="flex items-center gap-2 text-destructive"><HugeiconsIcon icon={AlertCircleIcon} strokeWidth={1.5} className="size-4" aria-hidden="true" />{query.error.message}</p><Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}>Retry</Button></div>
          : !query.data.length ? <p className="text-sm text-muted-foreground">No history yet.</p>
          : <ol>{query.data.map((entry, index) => <Entry key={entry.key} entry={entry} live={entry.key === liveKey} withYear={withYear} last={index === query.data.length - 1} />)}</ol>}
      </div>
    </FloatingSheetContent>
  </FloatingSheet>;
}

type Author = UnitHistory["drafts"][number]["by"];

/** "Mona", "Mona and Omar", "Mona, Omar and 2 others". */
function authorNames(authors: Author[]) {
  const names = authors.map(a => a?.name ?? "Unknown staff member");
  if (names.length <= 2) return names.join(" and ");
  const others = names.length - 2;
  return `${names.slice(0, 2).join(", ")} and ${others} other${others === 1 ? "" : "s"}`;
}

function Entry({ entry, live, withYear, last }: { entry: HistoryEntry<Author>; live: boolean; withYear: boolean; last: boolean }) {
  const published = entry.kind === "published";
  return <li className="relative flex gap-4 pb-8 last:pb-0">
    {!last && <span className="absolute top-5 bottom-0 left-[5px] w-px bg-border" aria-hidden="true" />}
    <span className={`relative mt-1.5 size-[11px] shrink-0 rounded-full border-2 ${published ? `border-primary ${live ? "bg-primary" : "bg-popover"}` : "border-muted-foreground/40 bg-popover"}`} aria-hidden="true" />
    <div className="min-w-0 flex-1 space-y-2">
      <div className="flex items-center gap-2">
        <p className="font-medium">{published ? "Published" : "Draft"}</p>
        {live && <Badge className="h-5 gap-1.5 px-2 text-[11px]"><span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden="true" />Live</Badge>}
        {entry.saves > 1 && <span className="text-xs text-muted-foreground tabular-nums">{entry.saves} saves</span>}
        <time dateTime={entry.at} className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">{historyTime(entry.at, new Date(), withYear)}</time>
      </div>
      <Collapsible className={`rounded-lg px-3 py-2.5 ${live ? "bg-primary/10 ring-1 ring-primary/25" : "bg-muted/50"}`}>
        <div className="flex items-center gap-2">
          <div className="flex shrink-0 -space-x-1.5">{entry.authors.slice(0, 3).map((author, i) => <Avatar key={author?.id ?? i} aria-hidden="true" className={`size-6 ring-2 ${live ? "ring-transparent" : "ring-muted"}`}><AvatarImage src={author?.avatarUrl} alt="" /><AvatarFallback className="text-[11px]">{author?.name?.slice(0, 1).toUpperCase() ?? "?"}</AvatarFallback></Avatar>)}</div>
          <span dir="auto" className="min-w-0 flex-1 truncate text-sm font-medium">{authorNames(entry.authors)}</span>
          {!!entry.summary?.details.length && <CollapsibleTrigger asChild><Button variant="ghost" size="icon-xs" aria-label="Show details" className="-mr-1 text-muted-foreground [&[data-state=open]>svg]:rotate-180"><HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={1.5} className="transition-transform" aria-hidden="true" /></Button></CollapsibleTrigger>}
        </div>
        {entry.summary ? <>
          <p dir="auto" className="mt-2 text-sm text-foreground/90">{entry.summary.headline}</p>
          {entry.summary.groups.length > 0 && <dl className="mt-2 grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1 text-xs">{entry.summary.groups.map(group => <div key={group.label} className="contents"><dt className="text-muted-foreground">{group.label}</dt><dd className="text-foreground/80 tabular-nums">{group.parts.join(" · ")}</dd></div>)}</dl>}
          <CollapsibleContent><ul className="mt-2.5 space-y-1 border-t border-foreground/10 pt-2.5 text-xs text-foreground/80">{entry.summary.details.map((detail, i) => <li key={i} dir="auto" className="flex gap-2"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-foreground/30" aria-hidden="true" />{detail}</li>)}</ul></CollapsibleContent>
        </> : <p className="mt-2 text-sm text-muted-foreground">Changes unavailable</p>}
      </Collapsible>
    </div>
  </li>;
}
