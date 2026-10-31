"use client";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, CheckmarkCircle02Icon, Clock01Icon, Edit02Icon } from "@hugeicons/core-free-icons";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { QueryContent } from "@/components/shared/query-content";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FloatingSheet, FloatingSheetContent, FloatingSheetHeader, FloatingSheetTitle, FloatingSheetTrigger } from "@/components/ui/floating-sheet";
import { unitPanelOptions, type UnitPanels } from "../panels";
import type { UnitHistory } from "../data";
import { historyEntries, historyTime, timeAgo, type HistoryEntry } from "../revisions";
import { unwrapContent } from "../types";
import { UNIT_ACTIONS, type UnitAction } from "./unit-action";

function selectHistory(panels: UnitPanels) {
  const history = unwrapContent(panels.history);
  return historyEntries(history.drafts, history.revisions);
}

/** The history button and its sheet, for the unit editor. */
export function VersionHistory({ academyId, unitId, userId, live, disabled, action, onAction }: {
  academyId: string; unitId: string; userId: string; live: boolean; disabled: boolean; action: UnitAction | null; onAction: (action: UnitAction) => void;
}) {
  return <FloatingSheet>
    <Tooltip><TooltipTrigger asChild><FloatingSheetTrigger asChild><Button variant="ghost" size="icon" aria-label="History"><HugeiconsIcon icon={Clock01Icon} strokeWidth={1.5} /></Button></FloatingSheetTrigger></TooltipTrigger><TooltipContent>History</TooltipContent></Tooltip>
    <FloatingSheetContent className="gap-0" aria-describedby={undefined}>
      <FloatingSheetHeader className="border-b">
        <FloatingSheetTitle className="text-lg font-semibold">Version history</FloatingSheetTitle>
      </FloatingSheetHeader>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <UnitHistoryList academyId={academyId} unitId={unitId} userId={userId} live={live} disabled={disabled} action={action} onAction={onAction} />
      </div>
    </FloatingSheetContent>
  </FloatingSheet>;
}

/** Every stored draft and publication of a unit, newest first, with who made it, when, and what changed. Loads once mounted. */
export function UnitHistoryList({ academyId, unitId, userId, live, disabled, action, onAction }: {
  academyId: string; unitId: string; userId: string; live: boolean; disabled: boolean; action: UnitAction | null; onAction: (action: UnitAction) => void;
}) {
  const query = useQuery({ ...unitPanelOptions(academyId, unitId), select: selectHistory });
  const liveKey = live ? query.data?.find(entry => entry.kind === "published")?.key : undefined;
  const withYear = new Set(query.data?.map(entry => new Date(entry.at).getFullYear())).size > 1;
  return <QueryContent query={query} label="history" isEmpty={entries => !entries.length} emptyTitle="No history yet.">
    {entries => <ol>{entries.map((entry, index) => <Entry key={entry.key} entry={entry} userId={userId} live={entry.key === liveKey} withYear={withYear} last={index === entries.length - 1} disabled={disabled}
      // Only the newest draft is the unit's working document, so only its own author acts on it from here. A kept version is already saved.
      action={index === 0 && entry.kind === "draft" && entry.creators.some(c => c?.id === userId) && !(entry.version && action === "version") ? action : null} onAction={onAction} />)}</ol>}
  </QueryContent>;
}

type Author = UnitHistory["drafts"][number]["by"];

/** "You", "You and Omar", "Mona, Omar and 2 others". */
function authorNames(authors: Author[], userId: string) {
  const names = authors.map(a => a?.id === userId ? "You" : a!.name!.split(" ").slice(0, 2).join(" "));
  if (names.length <= 2) return names.map(a => a.split(" ").slice(0, 1)).join(", ");
  const others = names.length - 1;
  return `${names.slice(0, 1).join(" & ")}, ${others} other${others === 1 ? "" : "s"}`;
}

function People({ authors: all, userId }: { authors: Author[]; userId: string }) {
  // Saves by removed or unrecorded staff are left out; an entry with no known author is untracked.
  const authors = all.filter(a => a && (a.id === userId || a.name));
  if (!authors.length) return <span className="text-muted-foreground">Untracked</span>;
  return <div className="flex min-w-0 items-center gap-2">
    <div className="flex shrink-0 -space-x-1.5">{authors.slice(0, 3).map((author, i) => <Avatar key={author?.id ?? i} aria-hidden="true" className="size-5 ring-2 ring-muted"><AvatarImage src={author?.avatarUrl} alt="" /><AvatarFallback className="text-[10px]">{author?.name?.slice(0, 1).toUpperCase() ?? "?"}</AvatarFallback></Avatar>)}</div>
    <span dir="auto" className="min-w-0 truncate font-semibold text-foreground/90">{authorNames(authors, userId)}</span>
  </div>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="contents"><dt className="text-xs leading-5 text-muted-foreground">{label}</dt><dd className="min-w-0 text-sm leading-5">{children}</dd></div>;
}

function Entry({ entry, userId, live, withYear, last, disabled, action, onAction }: { entry: HistoryEntry<Author>; userId: string; live: boolean; withYear: boolean; last: boolean; disabled: boolean; action: UnitAction | null; onAction: (action: UnitAction) => void }) {
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
            {live && <><span className="font-medium text-foreground">Live</span> · </>}
            {!published && (entry.version ? "Saved version · " : "Draft · ")}
            <time dateTime={entry.at}>{historyTime(entry.at, now, withYear)}</time>
            <span className="mx-1.5 text-muted-foreground/40" aria-hidden="true">|</span>{timeAgo(entry.at, now)}
          </p>
        </div>
        {action && <Button variant="outline" size="sm" disabled={disabled} className="shrink-0" onClick={() => onAction(action)}><HugeiconsIcon icon={UNIT_ACTIONS[action].icon} strokeWidth={1.5} aria-hidden="true" />{action === "publish" ? "Publish" : UNIT_ACTIONS[action].label}</Button>}
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
        </dl>
        {specifics.length > 0 && <CollapsibleContent><ul dir="auto" className="mt-2.5 space-y-1 border-t border-foreground/10 pt-2.5 text-xs text-foreground/80">{specifics.map((line, i) => <li key={i} className="flex gap-2"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-foreground/30" aria-hidden="true" />{line}</li>)}</ul></CollapsibleContent>}
      </Collapsible>
    </div>
  </li>;
}
