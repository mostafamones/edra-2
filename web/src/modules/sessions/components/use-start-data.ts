"use client";

import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";

import { academyNow } from "@/modules/schedules";
import { fetchLiveSessions, fetchSessionHistory, historyQueryKey, liveSessionsQueryKey, type HistoryFilter } from "../queries";
import { upcomingToday } from "../upcoming";
import { academyDate } from "./format";
import { useScheduleOptions } from "./use-schedule-options";

/** Live sessions refresh on this interval so sessions started on other devices appear. */
const LIVE_REFRESH_MS = 30_000;

/** Re-renders every minute so the upcoming list follows the clock. */
function useMinuteClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

const UNFILTERED: HistoryFilter = { search: "", from: null, to: null };

/** Live sessions, today's upcoming classes, and searchable history for the Sessions page. */
export function useSessionsData(academyId: string, filter: HistoryFilter) {
  const filtered = filter.search !== "" || filter.from !== null || filter.to !== null;
  const now = useMinuteClock();
  const live = useInfiniteQuery({
    queryKey: liveSessionsQueryKey(academyId),
    queryFn: ({ pageParam, signal }) => fetchLiveSessions(academyId, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    refetchInterval: LIVE_REFRESH_MS,
  });
  const history = useInfiniteQuery({
    queryKey: historyQueryKey(academyId, filter),
    queryFn: ({ pageParam, signal }) => fetchSessionHistory(academyId, filter, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });
  // Unsearched history, newest first, tells which schedules already ran today.
  const recent = useInfiniteQuery({
    queryKey: historyQueryKey(academyId, UNFILTERED),
    queryFn: ({ pageParam, signal }) => fetchSessionHistory(academyId, UNFILTERED, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    enabled: filtered,
  });
  const options = useScheduleOptions(academyId);

  const liveSessions = useMemo(() => live.data?.pages.flatMap((page) => page.sessions) ?? [], [live.data]);
  const pastSessions = useMemo(() => history.data?.pages.flatMap((page) => page.sessions) ?? [], [history.data]);
  const liveBySchedule = useMemo(
    () => new Map(liveSessions.map((session) => [session.scheduleId, session.id])),
    [liveSessions],
  );
  const upcoming = useMemo(() => {
    const data = options.schedules.data;
    if (!data || !live.data) return [];
    const today = academyDate(now.toISOString());
    const finished = (filtered ? recent.data : history.data)?.pages.flatMap((page) => page.sessions) ?? [];
    const taken = new Set([
      ...liveSessions.map((session) => session.scheduleId),
      ...finished.filter((session) => academyDate(session.startedAt) === today).map((session) => session.scheduleId),
    ]);
    return upcomingToday(data.schedules, data.slots, data.sessions, academyNow(now), taken);
  }, [options.schedules.data, live.data, liveSessions, history.data, recent.data, filtered, now]);

  return { live, liveSessions, liveBySchedule, history, pastSessions, upcoming, options };
}
