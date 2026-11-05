import { useInfiniteQuery, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { browserScopeGeneration } from "@/lib/browser-scope";
import { createClient } from "@/lib/supabase/client";
import { concernKeys, type ConcernScope } from "@/modules/concerns";
import { notificationPageSchema, notificationUnreadSchema } from "./validation";

/**
 * Notification reads are concern-scoped today, so their keys live under the concern scope: concern
 * live activity refreshes them with the other concern lists, and academy/account/preview switches
 * remove them with `forgetConcernScope`. Every read rechecks current access on the server.
 */
export const notificationKeys = {
  all: (scope: ConcernScope) => [...concernKeys.scope(scope), "notifications"] as const,
  list: (scope: ConcernScope) => [...concernKeys.scope(scope), "notifications", "list"] as const,
  unread: (scope: ConcernScope) => [...concernKeys.scope(scope), "notifications", "unread"] as const,
};

export class NotificationReadError extends Error {
  constructor(readonly code: "forbidden" | "unavailable") { super(code); }
}
type Rpc = ReturnType<typeof createClient>["rpc"];
async function call<T>(run: (rpc: Rpc) => PromiseLike<{ data: unknown; error: { code?: string } | null }>, schema: z.ZodType<T>) {
  const db = createClient();
  const { data, error } = await run(db.rpc.bind(db) as Rpc);
  if (error) throw new NotificationReadError(error.code === "42501" ? "forbidden" : "unavailable");
  return schema.parse(data);
}
const retry = (count: number, error: unknown) => !(error instanceof NotificationReadError && error.code === "forbidden") && count < 1;

export const PAGE_SIZE = 20;

/** Server total for the academy; never derived from a loaded page. */
export function useNotificationUnread(scope: ConcernScope) {
  return useQuery({
    queryKey: notificationKeys.unread(scope), retry, staleTime: 30_000,
    // Live concern activity invalidates this; the interval covers a degraded channel.
    refetchInterval: 120_000,
    queryFn: () => call((rpc) => rpc("notification_unread", { p_academy_id: scope.academyId }), notificationUnreadSchema),
  });
}

export function useNotificationList(scope: ConcernScope, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: notificationKeys.list(scope), enabled, retry, staleTime: 15_000,
    initialPageParam: null as { before: string; beforeId: string } | null,
    queryFn: ({ pageParam }) => call((rpc) => rpc("notification_inbox", {
      p_academy_id: scope.academyId, p_limit: PAGE_SIZE, ...(pageParam && { p_before: pageParam.before, p_before_id: pageParam.beforeId }),
    }), notificationPageSchema),
    getNextPageParam: (page) => {
      const last = page.items.at(-1);
      return page.hasMore && last ? { before: last.createdAt, beforeId: last.id } : null;
    },
  });
}

/** Marks the caller's own notifications read (all in the academy when `ids` is omitted). */
export async function markNotificationsRead(queryClient: QueryClient, scope: ConcernScope, ids?: string[]) {
  const generation = browserScopeGeneration();
  try {
    await call((rpc) => rpc("mark_notifications_read", { p_academy_id: scope.academyId, ...(ids && { p_ids: ids }) }), z.object({ marked: z.number().int() }));
    return true;
  } catch {
    return false;
  } finally {
    if (generation === browserScopeGeneration()) void queryClient.invalidateQueries({ queryKey: notificationKeys.all(scope) });
  }
}

export function useMarkNotificationsRead(scope: ConcernScope) {
  const queryClient = useQueryClient();
  return (ids?: string[]) => markNotificationsRead(queryClient, scope, ids);
}
