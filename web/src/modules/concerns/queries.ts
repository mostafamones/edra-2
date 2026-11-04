import { useEffect, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { createClient } from "@/lib/supabase/client";
import { applyChanges, prependOlder } from "./thread";
import {
  concernDetailSchema, concernInboxSchema, concernMessageSchema, concernSearchSchema, concernThreadSchema, concernUnreadSchema,
  type ConcernThread,
} from "./validation";
import { z } from "zod";

/**
 * Browser reads call participant-scoped database functions; each rechecks live membership and
 * participation. Every key starts with the academy and account, so the membership guard's
 * academy purge and `forgetConcernScope` remove them together.
 */
export type ConcernScope = { academyId: string; userId: string };
export type ConcernStatusFilter = "ongoing" | "settled" | null;

const root = (scope: ConcernScope) => ["concerns", scope.academyId, scope.userId] as const;
export const concernKeys = {
  scope: root,
  inbox: (scope: ConcernScope, status: ConcernStatusFilter) => [...root(scope), "inbox", status ?? "all"] as const,
  unread: (scope: ConcernScope) => [...root(scope), "unread"] as const,
  concern: (scope: ConcernScope, concernId: string) => [...root(scope), "concern", concernId] as const,
  detail: (scope: ConcernScope, concernId: string) => [...root(scope), "concern", concernId, "detail"] as const,
  thread: (scope: ConcernScope, concernId: string) => [...root(scope), "concern", concernId, "thread"] as const,
  search: (scope: ConcernScope, query: string) => [...root(scope), "search", query] as const,
};

/** A read the database refused. `forbidden` means access ended: forget the concern's data. */
export class ConcernReadError extends Error {
  constructor(readonly code: "forbidden" | "unavailable") { super(code); }
}

type Rpc = ReturnType<typeof createClient>["rpc"];
async function read<T>(call: (rpc: Rpc) => PromiseLike<{ data: unknown; error: { code?: string } | null }>, schema: z.ZodType<T>): Promise<T> {
  const db = createClient();
  const { data, error } = await call(db.rpc.bind(db) as Rpc);
  if (error) throw new ConcernReadError(error.code === "42501" ? "forbidden" : "unavailable");
  return schema.parse(data);
}
const isForbidden = (error: unknown) => error instanceof ConcernReadError && error.code === "forbidden";
const retry = (count: number, error: unknown) => !isForbidden(error) && count < 1;

export const PAGE_SIZE = 50;
export const loadConcernPage = (scope: ConcernScope, concernId: string, beforeSeq?: number) =>
  read((rpc) => rpc("concern_messages_page", { p_academy_id: scope.academyId, p_concern_id: concernId, p_before_seq: beforeSeq, p_limit: PAGE_SIZE }),
    concernThreadSchema);
export const loadConcernChanges = (scope: ConcernScope, concernId: string, afterRevision: number) =>
  read((rpc) => rpc("concern_message_changes", { p_academy_id: scope.academyId, p_concern_id: concernId, p_after_revision: afterRevision }),
    z.object({ messages: z.array(concernMessageSchema), hasMore: z.boolean(), cursor: z.number().int() }));
export const loadConcernDetail = (scope: ConcernScope, concernId: string) =>
  read((rpc) => rpc("concern_detail", { p_academy_id: scope.academyId, p_concern_id: concernId }), concernDetailSchema);
export const loadConcernUnread = (scope: ConcernScope) =>
  read((rpc) => rpc("concern_unread", { p_academy_id: scope.academyId }), concernUnreadSchema);
export const loadConcernSearch = (scope: ConcernScope, query: string) =>
  read((rpc) => rpc("search_concerns", { p_academy_id: scope.academyId, p_query: query }), concernSearchSchema);

/** Drops one concern's cached data after access ends, and refreshes the lists that showed it. */
export async function forgetConcern(queryClient: QueryClient, scope: ConcernScope, concernId: string) {
  const key = concernKeys.concern(scope, concernId);
  await queryClient.cancelQueries({ queryKey: key });
  queryClient.removeQueries({ queryKey: key });
  void queryClient.invalidateQueries({ queryKey: concernKeys.scope(scope), predicate: (query) => query.queryKey[3] !== "concern" });
}

/** Cancels and removes everything for an academy/account scope, e.g. when the panel switches academy. */
export async function forgetConcernScope(queryClient: QueryClient, scope: ConcernScope) {
  await queryClient.cancelQueries({ queryKey: concernKeys.scope(scope) });
  queryClient.removeQueries({ queryKey: concernKeys.scope(scope) });
}

/** Refreshes lists and counts without refetching open threads (those sync incrementally). */
export const invalidateConcernLists = (queryClient: QueryClient, scope: ConcernScope) =>
  queryClient.invalidateQueries({ queryKey: concernKeys.scope(scope), predicate: (query) => query.queryKey[3] !== "concern" });

const syncing = new Map<string, Promise<void>>();

/**
 * Fetches every change after the cached cursor, in commit order, until caught up. Concurrent calls
 * for one thread share a run. Results only update a cache entry that still exists, so a response
 * arriving after an academy switch or removal populates nothing.
 */
export function syncConcernThread(queryClient: QueryClient, scope: ConcernScope, concernId: string): Promise<void> {
  const key = concernKeys.thread(scope, concernId);
  const id = JSON.stringify(key);
  const running = syncing.get(id);
  if (running) return running.then(() => syncConcernThread(queryClient, scope, concernId));
  const run = (async () => {
    for (let round = 0; round < 20; round += 1) {
      const thread = queryClient.getQueryData<ConcernThread>(key);
      if (!thread) return;
      let changes;
      try {
        changes = await loadConcernChanges(scope, concernId, thread.cursor);
      } catch (error) {
        if (isForbidden(error)) await forgetConcern(queryClient, scope, concernId);
        return;
      }
      queryClient.setQueryData<ConcernThread>(key, (current) => current && applyChanges(current, changes));
      if (!changes.hasMore) return;
    }
  })().finally(() => syncing.delete(id));
  syncing.set(id, run);
  return run;
}

function useForgetOnDenied(scope: ConcernScope, concernId: string, error: unknown) {
  const queryClient = useQueryClient();
  const denied = isForbidden(error);
  useEffect(() => { if (denied) void forgetConcern(queryClient, scope, concernId); }, [denied, queryClient, scope, concernId]);
}

/** The newest messages; live updates arrive through `syncConcernThread`, so the window is never refetched wholesale. */
export function useConcernThread(scope: ConcernScope, concernId: string | null) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: concernKeys.thread(scope, concernId ?? ""),
    queryFn: () => loadConcernPage(scope, concernId!),
    enabled: !!concernId,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry,
  });
  useForgetOnDenied(scope, concernId ?? "", query.error);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const loadOlder = async () => {
    const key = concernKeys.thread(scope, concernId ?? "");
    const thread = queryClient.getQueryData<ConcernThread>(key);
    if (!concernId || !thread?.hasMore || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await loadConcernPage(scope, concernId, thread.messages[0]?.seq);
      queryClient.setQueryData<ConcernThread>(key, (current) => current && prependOlder(current, page));
    } catch (error) {
      if (isForbidden(error)) await forgetConcern(queryClient, scope, concernId);
    } finally {
      setLoadingOlder(false);
    }
  };
  return { ...query, loadOlder, loadingOlder };
}

/** Concern, current participants and read receipts. */
export function useConcernDetail(scope: ConcernScope, concernId: string | null) {
  const query = useQuery({
    queryKey: concernKeys.detail(scope, concernId ?? ""),
    queryFn: () => loadConcernDetail(scope, concernId!),
    enabled: !!concernId,
    retry,
  });
  useForgetOnDenied(scope, concernId ?? "", query.error);
  return query;
}

/** The caller's concerns by latest activity, optionally filtered to Ongoing or Settled. */
export function useConcernInbox(scope: ConcernScope, status: ConcernStatusFilter) {
  return useInfiniteQuery({
    queryKey: concernKeys.inbox(scope, status),
    initialPageParam: null as { updatedAt: string; id: string } | null,
    queryFn: ({ pageParam }) => read((rpc) => rpc("concern_inbox", {
      p_academy_id: scope.academyId, p_status: status ?? undefined, p_limit: PAGE_SIZE,
      p_before_updated_at: pageParam?.updatedAt, p_before_id: pageParam?.id,
    }), concernInboxSchema),
    getNextPageParam: (page) => {
      const last = page.concerns.at(-1);
      return page.hasMore && last ? { updatedAt: last.updatedAt, id: last.id } : undefined;
    },
    retry,
  });
}

export const useConcernUnread = (scope: ConcernScope) =>
  useQuery({ queryKey: concernKeys.unread(scope), queryFn: () => loadConcernUnread(scope), retry });

const SEARCH_DEBOUNCE_MS = 250;
/** Debounced; results are not retained once the search closes. */
export function useConcernSearch(scope: ConcernScope, input: string) {
  const [query, setQuery] = useState(input.trim());
  useEffect(() => {
    const timer = setTimeout(() => setQuery(input.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);
  return useQuery({
    queryKey: concernKeys.search(scope, query),
    queryFn: () => loadConcernSearch(scope, query),
    enabled: query.length >= 2 && query.length <= 100,
    gcTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
    retry,
  });
}
