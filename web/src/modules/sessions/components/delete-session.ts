import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { forceDeleteSession } from "../actions";
import { sessionsRootKey } from "../queries";
import type { PastSessionPage } from "../types";

type Target = { academyId: string; sessionId: string; title: string };

/** Force-deletes a session: it leaves every cached history list right away and returns if the delete fails. */
export async function forceDeleteOptimistically(queryClient: QueryClient, target: Target) {
  const { academyId, sessionId, title } = target;
  const filter = { queryKey: [...sessionsRootKey(academyId), "history"] };
  await queryClient.cancelQueries(filter);
  const snapshot = queryClient.getQueriesData<InfiniteData<PastSessionPage>>(filter);
  queryClient.setQueriesData<InfiniteData<PastSessionPage>>(filter, (data) => data && {
    ...data,
    pages: data.pages.map((page) => ({ ...page, sessions: page.sessions.filter((session) => session.id !== sessionId) })),
  });

  const restore = () => {
    for (const [key, data] of snapshot) queryClient.setQueryData(key, data);
  };
  try {
    const result = await forceDeleteSession({ academyId, sessionId });
    if (!result.ok) {
      restore();
      toast.error(result.message);
      return;
    }
    toast.success(`${title} was deleted.`);
    // The lists already match the server; mark them stale without refetching so nothing flashes.
    void queryClient.invalidateQueries({ queryKey: sessionsRootKey(academyId), refetchType: "none" });
  } catch {
    restore();
    toast.error("Could not delete the session. Check your connection and try again.");
  }
}
