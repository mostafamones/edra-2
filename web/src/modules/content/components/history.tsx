"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircleIcon, ArrowDown01Icon, CheckmarkCircle02Icon, Clock01Icon, Edit02Icon, MoreHorizontalIcon, SentIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { FloatingSheet, FloatingSheetContent, FloatingSheetHeader, FloatingSheetTitle, FloatingSheetTrigger } from "@/components/ui/floating-sheet";
import { unitPanelOptions, type UnitPanels } from "../panels";
import type { UnitHistory } from "../data";
import { historyEntries, historyTime, timeAgo, type HistoryEntry } from "../revisions";
import { unwrapContent } from "../types";

function selectHistory(panels: UnitPanels) {
  const history = unwrapContent(panels.history);
  return historyEntries(history.drafts, history.revisions);
}

/** Every stored draft and publication of a unit, newest first, with who made it, when, and what changed. */
export function VersionHistory({ academyId, unitId, userId, live, disabled, onSubmit, onPublish }: {
  academyId: string; unitId: string; userId: string; live: boolean; disabled: boolean; onSubmit?: () => void; onPublish?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const query = useQuery({ ...unitPanelOptions(academyId, unitId), enabled: open, select: selectHistory });
  const liveKey = live ? query.data?.find(entry => entry.kind === "published")?.key : undefined;
  const withYear = new Set(query.data?.map(entry => new Date(entry.at).getFullYear())).size > 1;
  return <FloatingSheet open={open} onOpenChange={setOpen}>
    <FloatingSheetTrigger asChild><Button variant="outline"><HugeiconsIcon icon={Clock01Icon} strokeWidth={1.5} aria-hidden="true" />History</Button></FloatingSheetTrigger>
    <FloatingSheetContent className="gap-0" aria-describedby={undefined}>
      <FloatingSheetHeader className="border-b">
        <FloatingSheetTitle className="text-lg font-semibold">Version history</FloatingSheetTitle>
      </FloatingSheetHeader>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {query.isPending ? <div role="status" aria-label="Loading history" className="space-y-6">{[0, 1, 2].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}</div>
          : query.isError ? <div role="alert" className="flex flex-col items-start gap-3 text-sm"><p className="flex items-center gap-2 text-destructive"><HugeiconsIcon icon={AlertCircleIcon} strokeWidth={1.5} className="size-4" aria-hidden="true" />{query.error.message}</p><Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}>Retry</Button></div>
          : !query.data.length ? <p className="text-sm text-muted-foreground">No history yet.</p>
          : <ol>{query.data.map((entry, index) => <Entry key={entry.key} entry={entry} userId={userId} live={entry.key === liveKey} withYear={withYear} last={index === query.data.length - 1} disabled={disabled}
            // Only the newest draft is the unit's working document, so only its own author can send or publish it from here.
            actions={index === 0 && entry.kind === "draft" && entry.creators.some(c => c?.id === userId) ? [onSubmit && { label: "Send for review", icon: SentIcon, run: onSubmit }, onPublish && { label: "Publish", icon: Tick02Icon, run: onPublish }].filter((action): action is Action => Boolean(action)) : []} />)}</ol>}
      </div>
    </FloatingSheetContent>
  </FloatingSheet>;
}

type Author = UnitHistory["drafts"][number]["by"];

type Action = { label: string; icon: typeof SentIcon; run: () => void };

/** "You", "You and Omar", "Mona, Omar and 2 others". */
function authorNames(authors: Author[], userId: string) {
  const names = authors.map(a => a?.id === userId ? "You" : a?.name?.split(" ").slice(0, 2).join(" ") ?? "Unknown staff member");
  if (names.length <= 2) return names.map(a => a.split(" ").slice(0, 1)).join(", ");
  const others = names.length - 1;
  return `${names.slice(0, 1).join(" & ")}, ${others} other${others === 1 ? "" : "s"}`;
}

function People({ authors, userId }: { authors: Author[]; userId: string }) {
  return <div className="flex min-w-0 items-center gap-2">
    <div className="flex shrink-0 -space-x-1.5">{authors.slice(0, 3).map((author, i) => <Avatar key={author?.id ?? i} aria-hidden="true" className="size-5 ring-2 ring-muted"><AvatarImage src={author?.avatarUrl} alt="" /><AvatarFallback className="text-[10px]">{author?.name?.slice(0, 1).toUpperCase() ?? "?"}</AvatarFallback></Avatar>)}</div>
    <span dir="auto" className="min-w-0 truncate font-semibold text-foreground/90">{authorNames(authors, userId)}</span>
  </div>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="contents"><dt className="text-xs leading-5 text-muted-foreground">{label}</dt><dd className="min-w-0 text-sm leading-5">{children}</dd></div>;
}

function Entry({ entry, userId, live, withYear, last, disabled, actions }: { entry: HistoryEntry<Author>; userId: string; live: boolean; withYear: boolean; last: boolean; disabled: boolean; actions: Action[] }) {
  const published = entry.kind === "published";
  const { summary } = entry;
  const now = new Date();
  const specifics = summary ? [...summary.lines, ...summary.details] : [];
  return <li className="relative flex gap-3 pb-8 last:pb-0">
    {!last && <span className="absolute top-8 bottom-0 left-[10.5px] w-px bg-border" aria-hidden="true" />}
    <span className={`relative mt-0.5 flex size-[22px] shrink-0 items-center justify-center rounded-full ${live ? "" : "text-muted-foreground"}`} aria-hidden="true">
      {live ? <span className="size-3 rounded-full bg-primary" /> : <HugeiconsIcon icon={published ? CheckmarkCircle02Icon : Edit02Icon} strokeWidth={1.5} className="size-3.5" />}
    </span>
    <div className="min-w-0 flex-1 space-y-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p dir="auto" className="font-medium">{summary?.headline || (published ? "Published" : "Draft")}</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {live && <><span className="font-medium text-primary">Live</span> · </>}
            {!published && "Draft · "}
            <time dateTime={entry.at}>{historyTime(entry.at, now, withYear)}</time>
            <span className="mx-1.5 text-muted-foreground/40" aria-hidden="true">|</span>{timeAgo(entry.at, now)}
          </p>
        </div>
        {actions.length > 0 && <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Draft actions" disabled={disabled} className="-mt-0.5 -mr-1.5 text-muted-foreground"><HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={1.5} /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-fit">{actions.map(action => <DropdownMenuItem key={action.label} onSelect={action.run}><HugeiconsIcon icon={action.icon} strokeWidth={1.5} />{action.label}</DropdownMenuItem>)}</DropdownMenuContent>
        </DropdownMenu>}
      </div>
      <Collapsible className="rounded-lg bg-muted/50 px-3 py-2.5">
        <dl className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-2">
          <Row label="Created by"><People authors={entry.creators} userId={userId} /></Row>
          {!summary ? <Row label="Changes"><span className="text-muted-foreground">Unavailable</span></Row>
            : summary.fields.length > 0 && <Row label="Changes">
              <div className="flex items-start gap-2">
                <div className="flex min-w-0 flex-1 flex-wrap gap-1">{summary.fields.map(field => <Badge key={field} variant="secondary" className="h-6 rounded-sm! px-1.5 text-[12px] font-normal">{field}</Badge>)}</div>
                {specifics.length > 0 && <CollapsibleTrigger asChild><Button variant="ghost" size="icon-xs" aria-label="Show details" className="-my-0.5 -mr-1 shrink-0 text-muted-foreground [&[data-state=open]>svg]:rotate-180"><HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={1.5} className="transition-transform" aria-hidden="true" /></Button></CollapsibleTrigger>}
              </div>
            </Row>}
          {entry.reviewer && <Row label="Reviewed"><People authors={[entry.reviewer]} userId={userId} /></Row>}
        </dl>
        {specifics.length > 0 && <CollapsibleContent><ul dir="auto" className="mt-2.5 space-y-1 border-t border-foreground/10 pt-2.5 text-xs text-foreground/80">{specifics.map((line, i) => <li key={i} className="flex gap-2"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-foreground/30" aria-hidden="true" />{line}</li>)}</ul></CollapsibleContent>}
      </Collapsible>
    </div>
  </li>;
}
