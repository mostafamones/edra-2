"use client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { loadAccessHistory } from "./actions";
import { unwrapContent } from "../types";
import { learningDate, type AccessRecord } from "./types";

export function AccessHistoryDialog({ academyId, unitId, userId, record, onClose }: { academyId: string; unitId: string; userId: string; record: AccessRecord; onClose: () => void }) {
  const query = useQuery({ queryKey: ["content-access-history", userId, academyId, unitId, record.id], queryFn: async () => unwrapContent(await loadAccessHistory({ academyId, unitId, recordId: record.id })), staleTime: 0 });
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>Access history</DialogTitle><DialogDescription>{record.name}</DialogDescription></DialogHeader>
    {query.isPending ? <Skeleton className="h-24" /> : query.isError ? <div role="alert"><p>{query.error.message}</p><Button variant="outline" onClick={() => query.refetch()}>Retry</Button></div> : !query.data.length ? <Empty><EmptyHeader><EmptyTitle>No access history</EmptyTitle></EmptyHeader></Empty> : <ol className="space-y-3">{query.data.map(event => <li key={event.id} className="rounded-md border p-3 text-sm"><p className="font-medium">{event.kind.replaceAll("_", " ")}</p><dl className="mt-2 grid grid-cols-2 gap-1"><dt>Issued</dt><dd>{learningDate(event.issuedAt)}</dd><dt>Expires</dt><dd>{learningDate(event.expiresAt)}</dd>{event.previousExpiry && <><dt>Previous expiry</dt><dd>{learningDate(event.previousExpiry)}</dd></>}{event.revokedAt && <><dt>Revoked</dt><dd>{learningDate(event.revokedAt)}</dd></>}</dl>{event.reason && <p className="mt-2">{event.reason}</p>}</li>)}</ol>}
  </DialogContent></Dialog>;
}
