import { infiniteQueryOptions } from "@tanstack/react-query";
import { fetchLiveSessions, fetchSessionHistory, historyQueryKey, liveSessionsQueryKey } from "@/modules/sessions";

export const calendarLiveOptions = (academyId: string) => infiniteQueryOptions({
  queryKey: liveSessionsQueryKey(academyId),
  queryFn: ({ pageParam, signal }) => fetchLiveSessions(academyId, pageParam, signal),
  initialPageParam: null as string | null, getNextPageParam: page => page.nextCursor, refetchInterval: 30_000,
});
export const calendarHistoryOptions = (academyId: string, from: string, to: string) => {
  const filter = { search: "", from, to, archive: "active" } as const;
  return infiniteQueryOptions({
    queryKey: historyQueryKey(academyId, filter),
    queryFn: ({ pageParam, signal }) => fetchSessionHistory(academyId, filter, pageParam, signal),
    initialPageParam: null as string | null, getNextPageParam: page => page.nextCursor,
  });
};
