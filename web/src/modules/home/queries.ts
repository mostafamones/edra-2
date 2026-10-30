import { infiniteQueryOptions } from "@tanstack/react-query";
import { fetchLiveSessions, fetchSessionHistory, historyQueryKey, liveSessionsQueryKey } from "@/modules/sessions";

const recentFilter = { search: "", from: null, to: null, archive: "active" } as const;

// Same shape and keys as Sessions: navigating between the two reuses loaded pages.
export const homeLiveOptions = (academyId: string) => infiniteQueryOptions({
  queryKey: liveSessionsQueryKey(academyId),
  queryFn: ({ pageParam, signal }) => fetchLiveSessions(academyId, pageParam, signal),
  initialPageParam: null as string | null,
  getNextPageParam: (page) => page.nextCursor,
  refetchInterval: 30_000,
});

export const homeRecentOptions = (academyId: string) => infiniteQueryOptions({
  queryKey: historyQueryKey(academyId, recentFilter),
  queryFn: ({ pageParam, signal }) => fetchSessionHistory(academyId, recentFilter, pageParam, signal),
  initialPageParam: null as string | null,
  getNextPageParam: (page) => page.nextCursor,
});
