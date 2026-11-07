import { useConcernHistory, type ConcernScope } from "../queries";
import type { ConcernHistoryEntry } from "../validation";
import { ConcernFeedback } from "./feedback";

function describe(entry: ConcernHistoryEntry) {
  const actor = entry.actorName ?? "Staff";
  const subject = entry.subjectName ?? "Staff";
  switch (entry.kind) {
    case "created": return `${actor} created the concern`;
    case "participant_added": return `${actor} added ${subject}`;
    case "participant_removed": return `${actor} removed ${subject}`;
    case "owner_recovered": return `${actor} recovered access as Owner`;
    case "settled": return `${actor} settled the concern`;
    case "reopened": return `${actor} reopened the concern`;
  }
}

/** Preserved membership, settlement and reopening history, oldest first. */
export function ConcernHistory({ scope, concernId, active }: { scope: ConcernScope; concernId: string; active: boolean }) {
  const history = useConcernHistory(scope, concernId, active);
  if (history.isLoading) return <ConcernFeedback>Loading history…</ConcernFeedback>;
  if (history.isError && !history.data) return <ConcernFeedback retry={() => void history.refetch()}>Could not load history</ConcernFeedback>;
  if (!history.data?.length) return <ConcernFeedback>No history</ConcernFeedback>;
  return <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
    {history.isError && <ConcernFeedback retry={() => void history.refetch()}>Could not refresh history</ConcernFeedback>}
    <ol aria-label="Concern history">{history.data.map((entry) => <li key={entry.id} className="space-y-1 border-b px-4 py-3 text-sm">
      <div className="flex items-start gap-2"><span className="min-w-0 flex-1 break-words" dir="auto">{describe(entry)}</span>
        <time dateTime={entry.occurredAt} className="shrink-0 text-xs text-muted-foreground">{new Date(entry.occurredAt).toLocaleString()}</time></div>
      {entry.note && <p className="whitespace-pre-wrap break-words rounded-md bg-muted/40 px-3 py-2" dir="auto">{entry.note}</p>}
    </li>)}</ol>
  </div>;
}
