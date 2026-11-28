import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { AtIcon, CheckmarkCircle02Icon, Message01Icon, NotificationOff01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useConcernInbox, useConcernSearch, type ConcernScope } from "../queries";
import type { ConcernInboxEntry, ConcernSearchHit } from "../validation";
import { concernMediaLabel } from "../media";
import { ConcernFeedback } from "./feedback";

const DAY = 86_400_000;

/** Compact list timestamp: time today, "Yesterday", weekday within a week, otherwise a date. */
export function shortWhen(iso: string, now = new Date()) {
  const date = new Date(iso);
  const days = Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(date).setHours(0, 0, 0, 0)) / DAY);
  if (days <= 0) return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  if (days < 7) return date.toLocaleDateString([], { weekday: "short" });
  return date.toLocaleDateString([], { day: "numeric", month: "short", ...(date.getFullYear() !== now.getFullYear() && { year: "numeric" }) });
}

const initials = (name: string | null) => (name ?? "Staff").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
const row = "h-auto w-full items-start justify-start gap-3 rounded-lg px-3 py-2.5 text-start font-normal whitespace-normal focus-visible:outline-2 focus-visible:outline-ring";

function When({ at, className }: { at: string; className?: string }) {
  return <time dateTime={at} title={new Date(at).toLocaleString()} className={cn("shrink-0 text-xs tabular-nums text-muted-foreground", className)}>{shortWhen(at)}</time>;
}

function Entry({ entry, onSelect }: { entry: ConcernInboxEntry; onSelect: () => void }) {
  const unread = entry.unread > 0;
  const last = entry.last;
  const preview = last && (last.deleted ? "Message deleted" : last.body ?? concernMediaLabel(last.media));
  return <Button type="button" variant="ghost" className={cn(row, unread && "bg-primary/5 hover:bg-primary/10")} onClick={onSelect}>
    <Avatar size="lg" aria-hidden="true">
      <AvatarFallback className={cn("text-xs", entry.status === "settled" && "text-primary")}>
        {entry.status === "settled" ? <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={1.5} className="size-5" />
          : last ? initials(last.authorName) : <HugeiconsIcon icon={Message01Icon} strokeWidth={1.5} className="size-5" />}
      </AvatarFallback>
    </Avatar>
    <span className="min-w-0 flex-1">
      <span className="flex items-baseline gap-2">
        <span className={cn("min-w-0 flex-1 truncate", unread ? "font-semibold" : "font-medium")} dir="auto">{entry.title}</span>
        <When at={last?.createdAt ?? entry.updatedAt} className={unread ? "font-medium text-primary" : undefined} />
      </span>
      <span className="mt-0.5 flex items-center gap-2">
        <span className={cn("min-w-0 flex-1 truncate text-sm", unread ? "text-foreground" : "text-muted-foreground", last?.deleted && "italic")} dir="auto">
          {last ? <>{last.authorName && <span className="font-medium">{last.authorName}: </span>}{preview}</> : "No messages yet"}
        </span>
        {entry.muted && <HugeiconsIcon icon={NotificationOff01Icon} strokeWidth={1.5} className="size-4 shrink-0 text-muted-foreground" aria-label="Muted" />}
        {entry.unreadMentions > 0 && <Badge variant="secondary" className="size-5 shrink-0 rounded-full p-0 text-primary" aria-label={`${entry.unreadMentions} unread mentions`}><HugeiconsIcon icon={AtIcon} strokeWidth={1.5} /></Badge>}
        {unread && <Badge className="h-5 min-w-5 shrink-0 rounded-full px-1.5 tabular-nums" aria-label={`${entry.unread} unread messages`}>{entry.unread > 99 ? "99+" : entry.unread}</Badge>}
      </span>
    </span>
  </Button>;
}

function Hit({ hit, onSelect }: { hit: ConcernSearchHit; onSelect: () => void }) {
  const settled = hit.status === "settled";
  return <Button type="button" variant="ghost" className={row} onClick={onSelect}>
    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden="true">
      <HugeiconsIcon icon={hit.messageId ? Message01Icon : Search01Icon} strokeWidth={1.5} className="size-4" />
    </span>
    <span className="min-w-0 flex-1 space-y-0.5">
      <span className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate font-medium" dir="auto">{hit.title}</span>
        <When at={hit.createdAt} />
      </span>
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Badge variant={settled ? "outline" : "secondary"} className="h-4 px-1.5 text-[10px]">{settled ? "Settled" : "Ongoing"}</Badge>
        {hit.messageId && hit.authorName && <span className="truncate" dir="auto">{hit.authorName}</span>}
      </span>
      {hit.messageId && <span className="block line-clamp-2 whitespace-pre-wrap break-words text-sm text-muted-foreground" dir="auto">{hit.body ?? concernMediaLabel(hit.media)}</span>}
    </span>
  </Button>;
}

function Loading({ label }: { label: string }) {
  return <div role="status" aria-label={label} className="space-y-1 p-2">
    {Array.from({ length: 5 }, (_, index) => <div key={index} className="flex gap-3 px-3 py-2.5">
      <Skeleton className="size-10 rounded-full" />
      <div className="flex-1 space-y-2 py-1"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-full" /></div>
    </div>)}
  </div>;
}

export function ConcernInbox({ scope, active, onSelect }: { scope: ConcernScope; active: boolean; onSelect: (hit: Pick<ConcernSearchHit, "concernId" | "messageId" | "seq">) => void }) {
  const [status, setStatus] = useState<"ongoing" | "settled">("ongoing");
  const [input, setInput] = useState("");
  const searching = input.trim().length > 0;
  const inbox = useConcernInbox(scope, status, active && !searching);
  const search = useConcernSearch(scope, input, active && searching);
  const validSearch = input.trim().length >= 2 && input.trim().length <= 100;
  const entries = inbox.data?.pages.flatMap((page) => page.concerns) ?? [];
  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="flex flex-wrap items-center gap-2 border-b px-4 pb-3">
      <InputGroup className="min-w-48 flex-1">
        <InputGroupAddon><HugeiconsIcon icon={Search01Icon} strokeWidth={1.5} aria-hidden="true" /></InputGroupAddon>
        <InputGroupInput aria-label="Search concerns and messages" value={input} maxLength={100} onChange={(event) => setInput(event.target.value)} />
      </InputGroup>
      {!searching && <Tabs value={status} onValueChange={(value) => setStatus(value as typeof status)}><TabsList><TabsTrigger value="ongoing">Ongoing</TabsTrigger><TabsTrigger value="settled">Settled</TabsTrigger></TabsList></Tabs>}
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" aria-label={searching ? "Search results" : "Concerns"}>
      {searching ? <>
        {!validSearch ? <ConcernFeedback>Enter at least two characters</ConcernFeedback>
          : search.isDebouncing || search.isLoading ? <Loading label="Searching…" />
          : search.isError ? <ConcernFeedback retry={() => void search.refetch()}>Could not search concerns</ConcernFeedback>
          : !search.data?.length ? <ConcernFeedback>No matching concerns or messages</ConcernFeedback>
          : <ul className="space-y-0.5 p-2">{search.data.map((hit) => <li key={`${hit.concernId}:${hit.messageId ?? "title"}`}><Hit hit={hit} onSelect={() => onSelect(hit)} /></li>)}</ul>}
      </> : <>
        {inbox.isLoading ? <Loading label="Loading concerns…" />
          : inbox.isError && !inbox.data ? <ConcernFeedback retry={() => void inbox.refetch()}>Could not load concerns</ConcernFeedback>
          : entries.length === 0 ? <ConcernFeedback>No {status} concerns</ConcernFeedback>
          : <ul className="space-y-0.5 p-2">{entries.map((entry) => <li key={entry.id}><Entry entry={entry} onSelect={() => onSelect({ concernId: entry.id, messageId: null, seq: null })} /></li>)}</ul>}
        {inbox.isError && inbox.data && <ConcernFeedback retry={() => void inbox.refetch()}>Could not refresh concerns</ConcernFeedback>}
        {inbox.hasNextPage && <div className="flex justify-center pb-3"><Button variant="ghost" size="sm" disabled={inbox.isFetchingNextPage} onClick={() => void inbox.fetchNextPage()}>{inbox.isFetchingNextPage ? "Loading…" : "Load more"}</Button></div>}
      </>}
    </div>
  </div>;
}
