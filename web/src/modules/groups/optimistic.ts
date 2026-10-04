import type { QueryClient } from "@tanstack/react-query";

import { groupListQueryKey, type AcademicYear, type Group } from "./queries";

type List = { year: AcademicYear | null; groups: Group[] };

/**
 * Applies a change to the cached active and archived group lists right away and returns a function
 * that puts the previous lists back. Callers still invalidate once the server has answered.
 */
export async function patchGroupLists(
  queryClient: QueryClient,
  academyId: string,
  change: (groups: Group[], archivedList: boolean) => Group[],
) {
  const previous: [readonly unknown[], List][] = [];
  for (const archivedList of [false, true]) {
    const key = groupListQueryKey(academyId, archivedList);
    await queryClient.cancelQueries({ queryKey: key });
    const list = queryClient.getQueryData<List>(key);
    if (!list) continue;
    previous.push([key, list]);
    queryClient.setQueryData<List>(key, { ...list, groups: change(list.groups, archivedList) });
  }
  return () => { for (const [key, list] of previous) queryClient.setQueryData(key, list); };
}
