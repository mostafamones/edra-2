import type { QueryClient } from "@tanstack/react-query";

import type { Label } from "@/modules/labels";
import { assessmentsRootKey } from "./queries";
import type { AssessmentListItem, AssessmentPage } from "./types";

/** Changes the labels shown on every cached list page right away. Callers still invalidate once the server has answered. */
export async function patchListLabels(queryClient: QueryClient, academyId: string, change: (item: AssessmentListItem) => Label[]) {
  const queryKey = [...assessmentsRootKey(academyId), "list"];
  // A list request already running would otherwise overwrite the change when it finishes.
  await queryClient.cancelQueries({ queryKey });
  queryClient.setQueriesData<AssessmentPage>({ queryKey }, (page) => page && { ...page, items: page.items.map((item) => ({ ...item, labels: change(item) })) });
}
