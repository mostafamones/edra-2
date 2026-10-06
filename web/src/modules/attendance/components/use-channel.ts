"use client";

import { useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";

export type ChannelStatus = "connecting" | "live" | "degraded";
export type Peer = { userId: string; name: string };

/** Rejoining periodically re-checks channel authorization, so a removed staff member stops receiving. */
const CHANNEL_LIFETIME_MS = 20 * 60_000;
/** Bursts of saves (for example a bulk change or several scanners) become one refetch. */
const COALESCE_MS = 300;

type Options = {
  academyId: string;
  sessionId: string;
  userId: string | null;
  name: string;
  /** Called (coalesced) when another save may have changed attendance, and after every (re)join. */
  onInvalidate: (revision: number | null) => void;
};

/**
 * Joins the private realtime channel for one session's attendance. Messages are minimal,
 * commit-backed invalidations; the caller refetches authoritative data. Presence shows which staff
 * are viewing and never locks anything.
 */
export function useAttendanceChannel({ academyId, sessionId, userId, name, onInvalidate }: Options) {
  const [status, setStatus] = useState<ChannelStatus>("connecting");
  const [peers, setPeers] = useState<Peer[]>([]);
  const [generation, setGeneration] = useState(0);
  const invalidate = useRef(onInvalidate);
  useEffect(() => { invalidate.current = onInvalidate; }, [onInvalidate]);

  useEffect(() => {
    const timer = setTimeout(() => setGeneration((value) => value + 1), CHANNEL_LIFETIME_MS);
    return () => clearTimeout(timer);
  }, [generation]);

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    let closed = false;
    let pending: ReturnType<typeof setTimeout> | null = null;
    let latest: number | null = null;
    const schedule = (revision: number | null) => {
      latest = revision === null ? latest : Math.max(latest ?? 0, revision);
      if (pending) return;
      pending = setTimeout(() => { pending = null; if (!closed) invalidate.current(latest); }, COALESCE_MS);
    };

    const channel = supabase.channel(`attendance:${academyId}:${sessionId}`, {
      config: { private: true, presence: { key: userId } },
    });
    channel
      .on("broadcast", { event: "attendance_changed" }, ({ payload }) => {
        const revision = typeof payload?.revision === "number" ? payload.revision : null;
        schedule(revision);
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ name?: string }>();
        setPeers(Object.entries(state)
          .filter(([key]) => key !== userId)
          .map(([key, metas]) => ({ userId: key, name: metas[0]?.name || "Staff member" })));
      });

    void (async () => {
      // Private channels authorize with the signed-in user's current access token.
      await supabase.realtime.setAuth();
      if (closed) return;
      channel.subscribe((state) => {
        if (closed) return;
        if (state === "SUBSCRIBED") {
          setStatus("live");
          // Reconcile anything saved before or while joining.
          schedule(null);
          void channel.track({ name });
        } else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT" || state === "CLOSED") {
          setStatus("degraded");
          setPeers([]);
        }
      });
    })();

    return () => {
      closed = true;
      if (pending) clearTimeout(pending);
      void supabase.removeChannel(channel);
      setStatus("connecting");
      setPeers([]);
    };
  }, [academyId, sessionId, userId, name, generation]);

  return { status, peers };
}
