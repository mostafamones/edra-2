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

function People({ authors }: { authors: Author[] }) {
  return <div className="flex min-w-0 items-center gap-2">
    <div className="flex shrink-0 -space-x-1.5">{authors.slice(0, 3).map((author, i) => <Avatar key={author?.id ?? i} aria-hidden="true" className="size-5 ring-2 ring-muted"><AvatarImage src={author?.avatarUrl} alt="" /><AvatarFallback className="text-[10px]">{author?.name?.slice(0, 1).toUpperCase() ?? "?"}</AvatarFallback></Avatar>)}</div>
    <span dir="auto" className="min-w-0 truncate text-foreground/90">{authorNames(authors)}</span>
  </div>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="contents"><dt className="text-xs leading-5 text-muted-foreground">{label}</dt><dd className="min-w-0 text-sm leading-5">{children}</dd></div>;
}

function Entry({ entry, live, withYear, last }: { entry: HistoryEntry<Author>; live: boolean; withYear: boolean; last: boolean }) {
  const published = entry.kind === "published";
  const { summary } = entry;
  return <li className="relative flex gap-4 pb-8 last:pb-0">
    {!last && <span className="absolute top-5 bottom-0 left-[5px] w-px bg-border" aria-hidden="true" />}
    <span className={`relative mt-1.5 size-[11px] shrink-0 rounded-full border-2 ${published ? `border-primary ${live ? "bg-primary" : "bg-popover"}` : "border-muted-foreground/40 bg-popover"}`} aria-hidden="true" />
    <div className="min-w-0 flex-1 space-y-2">
      <div>
        <p dir="auto" className="font-medium">{summary?.headline || (published ? "Published" : "Draft")}</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {live && <><span className="font-medium text-primary">Live</span> · </>}
          {!published && "Draft · "}
          {entry.saves > 1 && `${entry.saves} saves · `}
          <time dateTime={entry.at}>{historyTime(entry.at, new Date(), withYear)}</time>
        </p>
      </div>
      <Collapsible className="rounded-lg bg-muted/50 px-3 py-2.5">
        <dl className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-2">
          <Row label="Created by"><People authors={entry.creators} /></Row>
          {!summary ? <Row label="Changes"><span className="text-muted-foreground">Unavailable</span></Row>
            : summary.fields.length > 0 && <Row label="Changes">
              <div className="flex items-start gap-2">
                <div className="flex min-w-0 flex-1 flex-wrap gap-1">{summary.fields.map(field => <Badge key={field} variant="secondary" className="h-5 px-1.5 text-[11px] font-normal">{field}</Badge>)}</div>
                {summary.lines.length > 0 && <CollapsibleTrigger asChild><Button variant="ghost" size="icon-xs" aria-label="Show details" className="-my-0.5 -mr-1 shrink-0 text-muted-foreground [&[data-state=open]>svg]:rotate-180"><HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={1.5} className="transition-transform" aria-hidden="true" /></Button></CollapsibleTrigger>}
              </div>
            </Row>}
          {entry.reviewer && <Row label="Reviewed"><People authors={[entry.reviewer]} /></Row>}
        </dl>
        {summary && summary.lines.length > 0 && <CollapsibleContent><ul dir="auto" className="mt-2.5 space-y-1 border-t border-foreground/10 pt-2.5 text-xs text-foreground/80">{[...summary.lines, ...summary.details].map((line, i) => <li key={i} className="flex gap-2"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-foreground/30" aria-hidden="true" />{line}</li>)}</ul></CollapsibleContent>}
      </Collapsible>
    </div>
  </li>;
}
