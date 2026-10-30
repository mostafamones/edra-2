import { queryOptions } from "@tanstack/react-query";
import { assessmentsRootKey, loadAssessments } from "./queries";
import { DEFAULT_PARAMS } from "./params";
import type { AssessmentListItem } from "./types";

/** Complete dated staff catalog; uses the same authorized RPC as the assessment list. */
export const assessmentCalendarOptions = (academyId: string, year: string) => queryOptions({
  queryKey: [...assessmentsRootKey(academyId), "calendar", year],
  queryFn: async () => {
    const filters = { ...DEFAULT_PARAMS, year, pageSize: 96 as const };
    const items: AssessmentListItem[] = [];
    for (let page = 0; ; page++) {
      const result = await loadAssessments(academyId, filters, page);
      items.push(...result.items);
      if (items.length >= result.total) return items;
      if (!result.items.length) throw new Error("Assessment catalog changed. Retry.");
    }
  },
});
