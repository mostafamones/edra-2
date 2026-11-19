import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { createClient } from "@/lib/supabase/client";
import { concernKeys, forgetConcern, invalidateConcernLists, syncConcernThread, useConcernDetail, type ConcernScope } from "./queries";
import { activeTypers } from "./thread";
import type { ConcernThread } from "./validation";

export type ConcernLiveStatus = "connecting" | "live" | "degraded";

/** Rejoining re-runs channel authorization, so removed or suspended staff stop receiving hints. */
const CHANNEL_LIFETIME_MS = 20 * 60_000;
/** Without a live channel, catch up on this interval instead. */
const FALLBACK_SYNC_MS = 15_000;
const COALESCE_MS = 150;
const TYPING_REFRESH_MS = 3000;

/**
 * Joins `concern:<academy>:<concern>:<user>`. Delivery selects current authorized recipients.
 * Broadcasts are commit-backed hints with ids and revisions
 * only; content always comes from the authorized change feed, which also recovers anything missed
 * while disconnected. Typing is a database-attributed broadcast carrying only the typist's id.
 */
export function useConcernLive({ scope, concernId, typing }: { scope: ConcernScope; concernId: string | null; typing: boolean }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ConcernLiveStatus>("connecting");
  const [seen, setSeen] = useState<ReadonlyMap<string, number>>(new Map());
  const [now, setNow] = useState(() => Date.now());
  const [generation, setGeneration] = useState(0);
  const track = useRef<(typing: boolean) => void>(() => {});
  const { academyId, userId } = scope;

  useEffect(() => {
    const timer = setTimeout(() => setGeneration((value) => value + 1), CHANNEL_LIFETIME_MS);
    return () => clearTimeout(timer);
  }, [generation]);

  useEffect(() => {
    if (!concernId) return;
    const target = { academyId, userId };
    const db = createClient();
    let closed = false;
    let pending: ReturnType<typeof setTimeout> | null = null;
    const sync = () => {
      if (pending || closed) return;
      pending = setTimeout(() => { pending = null; if (!closed) void syncConcernThread(queryClient, target, concernId); }, COALESCE_MS);
    };
    const refreshDetail = () => {
      if (closed) return;
      void queryClient.invalidateQueries({ queryKey: concernKeys.detail(target, concernId) });
      void queryClient.invalidateQueries({ queryKey: concernKeys.history(target, concernId) });
    };

    const channel = db.channel(`concern:${academyId}:${concernId}:${userId}`, { config: { private: true } });
    channel
      .on("broadcast", { event: "changed" }, ({ payload }) => {
        const cursor = queryClient.getQueryData<ConcernThread>(concernKeys.thread(target, concernId))?.cursor ?? 0;
        if (typeof payload?.revision !== "number" || payload.revision > cursor) sync();
      })
      // Receipts, membership and lifecycle: the refetch rechecks access and forgets the concern if it ended.
      .on("broadcast", { event: "participants" }, refreshDetail)
      .on("broadcast", { event: "concern" }, () => { if (closed) return; refreshDetail(); void invalidateConcernLists(queryClient, target); })
      // The database names the typist from their session; a client cannot type as someone else.
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (closed || typeof payload?.userId !== "string") return;
        const typist: string = payload.userId;
        // Expiry counts from when this client received the update, never the sender's clock.
        setSeen((current) => {
          const next = new Map(current);
          if (payload.typing === true) next.set(typist, Date.now()); else next.delete(typist);
          return next;
        });
      });
    track.current = (value) => {
      if (closed) return;
      void db.rpc("set_concern_typing", { p_academy_id: academyId, p_concern_id: concernId, p_typing: value })
        .then(({ error }) => { if (error?.code === "42501") refreshDetail(); }, () => {});
    };

    void (async () => {
      try { await db.realtime.setAuth(); } catch { /* The fallback interval below still catches up. */ }
      if (closed) return;
      channel.subscribe((state) => {
        if (closed) return;
        if (state === "SUBSCRIBED") {
          setStatus("live");
          // Reconnect recovery: anything committed while away arrives through the change feed.
          sync();
          refreshDetail();
        } else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT" || state === "CLOSED") {
          setStatus("degraded");
          setSeen(new Map());
        }
      });
    })();

    return () => {
      closed = true;
      if (pending) clearTimeout(pending);
      track.current = () => {};
      void db.removeChannel(channel);
      setStatus("connecting");
      setSeen(new Map());
    };
  }, [academyId, userId, concernId, generation, queryClient]);

  // Degraded: poll the change feed so messages still arrive and gaps close.
  useEffect(() => {
    if (status !== "degraded" || !concernId) return;
    const timer = setInterval(() => { void syncConcernThread(queryClient, { academyId, userId }, concernId); }, FALLBACK_SYNC_MS);
    return () => clearInterval(timer);
  }, [status, academyId, userId, concernId, queryClient]);

  // Publish typing while true, refreshing so others' expiry does not hide an ongoing burst.
  useEffect(() => {
    if (status !== "live" || !typing) return;
    track.current(true);
    const timer = setInterval(() => track.current(true), TYPING_REFRESH_MS);
    return () => { clearInterval(timer); track.current(false); };
  }, [typing, status]);

  // Re-render while anyone types so entries expire on time.
  useEffect(() => {
    if (seen.size === 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [seen]);

  const { data: detail } = useConcernDetail(scope, concernId);
  const participantIds = useMemo(() => new Set(detail?.participants.filter((participant) => !participant.suspended).map((participant) => participant.userId) ?? []), [detail]);
  const typers = activeTypers(seen, participantIds, userId, now);
  return { status, typers, reconnect: () => setGeneration((value) => value + 1) };
}

/**
 * Joins the caller's own `concern-inbox:<user>:<academy>` channel: activity in any permitted concern
 * refreshes the list and unread counts, and catches up an open thread. Each (re)join reconciles.
 */
export function useConcernInboxLive(scope: ConcernScope) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ConcernLiveStatus>("connecting");
  const [generation, setGeneration] = useState(0);
  const { academyId, userId } = scope;

  useEffect(() => {
    const timer = setTimeout(() => setGeneration((value) => value + 1), CHANNEL_LIFETIME_MS);
    return () => clearTimeout(timer);
  }, [generation]);

  useEffect(() => {
    const target = { academyId, userId };
    const db = createClient();
    let closed = false;
    let pending: ReturnType<typeof setTimeout> | null = null;
    const touched = new Set<string>();
    const flush = () => {
      pending = null;
      if (closed) return;
      void invalidateConcernLists(queryClient, target);
      for (const concernId of touched) void syncConcernThread(queryClient, target, concernId);
      touched.clear();
    };
    const schedule = (concernId?: string) => {
      if (closed) return;
      if (concernId) touched.add(concernId);
      pending ??= setTimeout(flush, 300);
    };
    const channel = db.channel(`concern-inbox:${userId}:${academyId}`, { config: { private: true } })
      .on("broadcast", { event: "revoked" }, ({ payload }) => {
        if (!closed && typeof payload?.concernId === "string") void forgetConcern(queryClient, target, payload.concernId);
      })
      .on("broadcast", { event: "activity" }, ({ payload }) => {
        schedule(typeof payload?.concernId === "string" ? payload.concernId : undefined);
      });
    void (async () => {
      try { await db.realtime.setAuth(); } catch { /* Lists still refresh on their normal schedule. */ }
      if (closed) return;
      channel.subscribe((state) => {
        if (closed) return;
        if (state === "SUBSCRIBED") { setStatus("live"); schedule(); }
        else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT" || state === "CLOSED") setStatus("degraded");
      });
    })();
    return () => {
      closed = true;
      if (pending) clearTimeout(pending);
      void db.removeChannel(channel);
      setStatus("connecting");
    };
  }, [academyId, userId, generation, queryClient]);

  return { status };
}
