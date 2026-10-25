"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircleIcon, Clock01Icon } from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FloatingSheet, FloatingSheetContent, FloatingSheetDescription, FloatingSheetHeader, FloatingSheetTitle, FloatingSheetTrigger } from "@/components/ui/floating-sheet";
import { loadUnitHistory } from "../actions";
import { historyEntries, type HistoryEntry } from "../revisions";
import { unwrapContent } from "../types";

const TITLES = { created: "Unit created", saved: "Draft saved" };

/** Every stored draft and publication of a unit, newest first, with who made it, when, and what changed. */
export function VersionHistory({ academyId, unitId, live }: { academyId: string; unitId: string; live: boolean }) {
  const [open, setOpen] = useState(false);
  const query = useQuery({ queryKey: ["content", academyId, "unit", unitId, "history"], enabled: open, queryFn: async () => {
    const history = unwrapContent(await loadUnitHistory(academyId, unitId));
    return historyEntries(history.drafts, history.revisions);
  } });
  const liveKey = live ? query.data?.find(entry => entry.kind === "published")?.key : undefined;
  return <FloatingSheet open={open} onOpenChange={setOpen}>
    <FloatingSheetTrigger asChild><Button variant="outline"><HugeiconsIcon icon={Clock01Icon} strokeWidth={1.5} aria-hidden="true" />History</Button></FloatingSheetTrigger>
    <FloatingSheetContent className="gap-0">
      <FloatingSheetHeader className="border-b">
        <FloatingSheetTitle className="text-lg font-semibold">Version history</FloatingSheetTitle>
        <FloatingSheetDescription className={query.data ? undefined : "sr-only"}>{query.data ? `${query.data.length} change${query.data.length === 1 ? "" : "s"}` : "Drafts and publications of this unit"}</FloatingSheetDescription>
      </FloatingSheetHeader>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {query.isPending ? <div role="status" aria-label="Loading history" className="space-y-6">{[0, 1, 2].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}</div>
          : query.isError ? <div role="alert" className="flex flex-col items-start gap-3 text-sm"><p className="flex items-center gap-2 text-destructive"><HugeiconsIcon icon={AlertCircleIcon} strokeWidth={1.5} className="size-4" aria-hidden="true" />{query.error.message}</p><Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}>Retry</Button></div>
          : !query.data.length ? <p className="text-sm text-muted-foreground">No history yet.</p>
          : <ol>{query.data.map((entry, index) => <Entry key={entry.key} entry={entry} live={entry.key === liveKey} last={index === query.data.length - 1} />)}</ol>}
      </div>
    </FloatingSheetContent>
  </FloatingSheet>;
}

function Entry({ entry, live, last }: { entry: HistoryEntry; live: boolean; last: boolean }) {
  const published = entry.kind === "published";
  return <li className="relative flex gap-4 pb-8 last:pb-0">
    {!last && <span className="absolute top-5 bottom-0 left-[5px] w-px bg-border" aria-hidden="true" />}
    <span className={`relative mt-1.5 size-[11px] shrink-0 rounded-full border-2 ${published ? `border-primary ${live ? "bg-primary" : "bg-popover"}` : "border-muted-foreground/40 bg-popover"}`} aria-hidden="true" />
    <div className="min-w-0 flex-1 space-y-2">
      <div className="space-y-0.5">
        <p className="flex items-center gap-2 font-medium">{entry.kind === "published" ? `Version ${entry.revision}` : TITLES[entry.kind]}{live && <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">Live</Badge>}</p>
        <p className="text-xs text-muted-foreground"><span dir="auto">{entry.by ?? "Unknown staff member"}</span> · <time dateTime={entry.at} className="tabular-nums">{new Date(entry.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time></p>
      </div>
      {entry.changes
        ? <ul className="space-y-1 rounded-lg bg-muted/40 px-3 py-2.5 text-sm">{entry.changes.map((change, i) => <li key={i} dir="auto" className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/60" aria-hidden="true" />{change}</li>)}</ul>
        : <p className="text-sm text-muted-foreground">Changes unavailable</p>}
    </div>
  </li>;
}
