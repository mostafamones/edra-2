"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/modules/auth";
import { Button } from "@/components/ui/button";
import { unwrapContent } from "../types";
import { loadTaught } from "./actions";
import { taughtQueryKey } from "./types";

/** The existing attendance revision check rejects a review made stale by a content save. */
export function ContentTaughtReview({ academyId, sessionId, correction }: { academyId: string; sessionId: string; correction: boolean }) {
  const { user } = useAuth();
  const query = useQuery({ queryKey: taughtQueryKey(user?.id ?? "", academyId, sessionId), queryFn: async () => unwrapContent(await loadTaught({ academyId, sessionId })), enabled: !!user, refetchOnMount: "always", refetchInterval: 5000, retry: false });
  if (query.isPending) return <p role="status" className="text-sm">Loading taught units…</p>;
  if (query.isError) return <div role="alert" className="text-sm text-destructive">Couldn’t refresh taught units. <Button size="sm" variant="outline" onClick={() => query.refetch()}>Retry</Button></div>;
  return <div className="space-y-2 text-sm"><h3 className="font-medium">Taught units ({query.data.items.length})</h3>
    {query.data.items.length ? <ul className="list-inside list-disc">{query.data.items.map(item => <li key={item.unitId}>{item.title} · v{item.revision}</li>)}</ul> : <p>No taught units recorded.</p>}
    {!correction && <p role="status" className="text-muted-foreground">Finalizing locks this unit list.</p>}
  </div>;
}
