import { useEffect, useMemo } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { assessmentCalendarOptions } from "@/modules/assessments";
import { groupListQueryKey, loadGroups, loadStructure, structureQueryKey } from "@/modules/groups";
import { buildAudienceLookup, loadSchedules, scheduleListQueryKey } from "@/modules/schedules";
import { calendarEvents, shiftDay } from "./events";
import { calendarHistoryOptions, calendarLiveOptions } from "./queries";

/** Calendar events for `range`, built from the shared schedule, session and assessment caches. */
export function useCalendarEvents(academyId: string, range: string[], today: string) {
  const schedules = useQuery({ queryKey: scheduleListQueryKey(academyId), queryFn: () => loadSchedules(academyId) });
  const structure = useQuery({ queryKey: structureQueryKey(academyId), queryFn: () => loadStructure(academyId) });
  const groups = useQuery({ queryKey: groupListQueryKey(academyId, false), queryFn: () => loadGroups(academyId) });
  const archivedGroups = useQuery({ queryKey: groupListQueryKey(academyId, true), queryFn: () => loadGroups(academyId, { archived: true }) });
  const year = schedules.data?.year;
  const assessments = useQuery({ ...assessmentCalendarOptions(academyId, year?.id ?? ""), enabled: !!year });
  const live = useInfiniteQuery(calendarLiveOptions(academyId));
  const history = useInfiniteQuery(calendarHistoryOptions(academyId, shiftDay(range[0], -1), range[range.length - 1]));
  // Complete the existing paginated queries without changing their cache shape or duplicating endpoints.
  const { hasNextPage: liveHasMore, isFetching: liveFetching, isError: liveError, fetchNextPage: fetchMoreLive } = live;
  const { hasNextPage: historyHasMore, isFetching: historyFetching, isError: historyError, fetchNextPage: fetchMoreHistory } = history;
  useEffect(() => { if (liveHasMore && !liveFetching && !liveError) void fetchMoreLive(); }, [liveHasMore, liveFetching, liveError, fetchMoreLive]);
  useEffect(() => { if (historyHasMore && !historyFetching && !historyError) void fetchMoreHistory(); }, [historyHasMore, historyFetching, historyError, fetchMoreHistory]);
  const queries = [schedules, structure, groups, archivedGroups, live, history, ...(year ? [assessments] : [])];
  const failures = queries.filter(query => query.isError);
  const loading = queries.some(query => query.isPending) || (live.hasNextPage && !live.isError) || (history.hasNextPage && !history.isError);
  const events = useMemo(() => {
    if (!schedules.data || !structure.data || !groups.data || !archivedGroups.data) return [];
    return calendarEvents({ days: range, today, ...schedules.data,
      dates: schedules.data.sessions,
      lookup: buildAudienceLookup({ groups: [...groups.data.groups, ...archivedGroups.data.groups], tracks: structure.data.historicalTracks, levelNames: structure.data.levelNames }),
      sessions: [...(history.data?.pages.flatMap(page => page.sessions) ?? []), ...(live.data?.pages.flatMap(page => page.sessions) ?? [])].filter(session => session.academicYearId === schedules.data.year?.id),
      assessments: assessments.data ?? [],
    });
  }, [range[0], range.length, today, schedules.data, structure.data, groups.data, archivedGroups.data, live.data, history.data, assessments.data]);
  return { events, failures, loading, year, structure, groups, archivedGroups, assessments, live, history };
}
