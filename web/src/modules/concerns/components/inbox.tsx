import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConcernInbox, useConcernSearch, type ConcernScope } from "../queries";
import type { ConcernSearchHit } from "../validation";
import { ConcernFeedback } from "./feedback";

export function ConcernInbox({ scope, active, onSelect }: { scope: ConcernScope; active: boolean; onSelect: (hit: Pick<ConcernSearchHit, "concernId" | "messageId" | "seq">) => void }) {
  const [status, setStatus] = useState<"ongoing" | "settled">("ongoing");
  const [input, setInput] = useState("");
  const searching = input.trim().length > 0;
  const inbox = useConcernInbox(scope, status, active && !searching);
  const search = useConcernSearch(scope, input, active && searching);
  const validSearch = input.trim().length >= 2 && input.trim().length <= 100;
  const entries = inbox.data?.pages.flatMap((page) => page.concerns) ?? [];
  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="space-y-3 border-b px-4 pb-3">
      <Input aria-label="Search concerns and messages" value={input} maxLength={100} onChange={(event) => setInput(event.target.value)} />
      <Tabs value={status} onValueChange={(value) => setStatus(value as typeof status)}><TabsList className="w-full"><TabsTrigger value="ongoing">Ongoing</TabsTrigger><TabsTrigger value="settled">Settled</TabsTrigger></TabsList></Tabs>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" aria-label={searching ? "Search results" : "Concerns"}>
      {searching ? <>
        {!validSearch ? <ConcernFeedback>Enter at least two characters</ConcernFeedback>
          : search.isDebouncing || search.isLoading ? <ConcernFeedback>Searching…</ConcernFeedback>
          : search.isError ? <ConcernFeedback retry={() => void search.refetch()}>Could not search concerns</ConcernFeedback>
          : !search.data?.length ? <ConcernFeedback>No matching concerns or messages</ConcernFeedback>
          : <ul>{search.data.map((hit) => <li key={`${hit.concernId}:${hit.messageId ?? "title"}`}><Button type="button" variant="ghost" className="h-auto w-full flex-col items-stretch justify-start space-y-1 rounded-none border-x-0 border-t-0 border-b border-border px-4 py-3 text-start font-normal whitespace-normal focus-visible:outline-2 focus-visible:outline-ring" onClick={() => onSelect(hit)}>
            <span className="block font-medium break-words" dir="auto">{hit.title}</span><span className="text-xs text-muted-foreground">{hit.status === "settled" ? "Settled" : "Ongoing"}</span>
            {hit.body && <span className="block line-clamp-3 whitespace-pre-wrap break-words text-sm" dir="auto">{hit.body}</span>}
          </Button></li>)}</ul>}
      </> : <>
        {inbox.isLoading ? <ConcernFeedback>Loading concerns…</ConcernFeedback>
          : inbox.isError && !inbox.data ? <ConcernFeedback retry={() => void inbox.refetch()}>Could not load concerns</ConcernFeedback>
          : entries.length === 0 ? <ConcernFeedback>No {status} concerns</ConcernFeedback>
          : <ul>{entries.map((entry) => <li key={entry.id}><Button type="button" variant="ghost" className="flex h-auto w-full items-start justify-start gap-3 rounded-none border-x-0 border-t-0 border-b border-border px-4 py-3 text-start font-normal whitespace-normal focus-visible:outline-2 focus-visible:outline-ring" onClick={() => onSelect({ concernId: entry.id, messageId: null, seq: null })}>
            <span className="min-w-0 flex-1"><span className="block font-medium break-words" dir="auto">{entry.title}</span>
              {entry.last && <span className="mt-1 block line-clamp-2 break-words text-sm text-muted-foreground" dir="auto">{entry.last.deleted ? "Message deleted" : entry.last.body}</span>}
            </span>{entry.unread > 0 && <Badge aria-label={`${entry.unread} unread messages`}>{entry.unread}</Badge>}
          </Button></li>)}</ul>}
        {inbox.isError && inbox.data && <ConcernFeedback retry={() => void inbox.refetch()}>Could not refresh concerns</ConcernFeedback>}
        {inbox.hasNextPage && <Button variant="ghost" className="m-3" disabled={inbox.isFetchingNextPage} onClick={() => void inbox.fetchNextPage()}>{inbox.isFetchingNextPage ? "Loading…" : "Load more"}</Button>}
      </>}
    </div>
  </div>;
}
