import { browserScopeGeneration } from "@/lib/browser-scope";
import { useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  createConcern, deleteConcernMessage, editConcernMessage, markConcernRead, sendConcernMessage, setConcernReaction,
} from "./actions";
import { forgetConcern, invalidateConcernLists, concernKeys, type ConcernScope } from "./queries";
import { mergeMessages, withRetry } from "./thread";
import type { ConcernDetail, ConcernThread, CreateConcernInput, SendMessageInput } from "./validation";

type Body = { body: string; mentions: string[] };

/**
 * Commands for one concern. The scope is captured when each call starts: a result arriving after
 * an academy switch or removal only updates that scope's cache entries, and only if they still exist.
 * Messages update the cached window in place (higher revision wins); nothing is granted optimistically.
 */
export function useConcernCommands(scope: ConcernScope, concernId: string, onDenied?: () => void) {
  const queryClient = useQueryClient();
  const cacheIdentity = () => queryClient.getQueryCache().find({ queryKey: concernKeys.detail(scope, concernId), exact: true });
  const readScope = `${scope.academyId}:${scope.userId}:${concernId}`;
  const lastRead = useRef({ scope: readScope, seq: 0 });

  async function settle<T extends { ok: boolean; code?: string; message?: unknown }>(target: ConcernScope, result: T, generation: number, original: ReturnType<typeof cacheIdentity>) {
    if (generation !== browserScopeGeneration() || original !== cacheIdentity()) return result;
    if (result.ok) {
      const message = (result as unknown as { message: ConcernThread["messages"][number] }).message;
      queryClient.setQueryData<ConcernThread>(concernKeys.thread(target, concernId), (current) => current && mergeMessages(current, [message]));
      void invalidateConcernLists(queryClient, target);
    } else if (result.code === "forbidden") {
      onDenied?.();
      await forgetConcern(queryClient, target, concernId);
    } else if (result.code === "concern_settled") {
      void queryClient.invalidateQueries({ queryKey: concernKeys.detail(target, concernId) });
    }
    return result;
  }

  return {
    /** Generate `messageId` once per message (crypto.randomUUID) and reuse it for manual retries. */
    send: async (input: Body & { messageId: string; replyToId: string | null }) => {
      const target = { ...scope };
      const generation = browserScopeGeneration();
      const original = cacheIdentity();
      const payload: SendMessageInput = { academyId: target.academyId, concernId, ...input };
      return settle(target, await withRetry(() => sendConcernMessage(payload)), generation, original);
    },
    edit: async (messageId: string, input: Body) => {
      const target = { ...scope };
      const generation = browserScopeGeneration();
      const original = cacheIdentity();
      return settle(target, await withRetry(() => editConcernMessage({ academyId: target.academyId, concernId, messageId, ...input })), generation, original);
    },
    remove: async (messageId: string) => {
      const target = { ...scope };
      const generation = browserScopeGeneration();
      const original = cacheIdentity();
      return settle(target, await withRetry(() => deleteConcernMessage({ academyId: target.academyId, concernId, messageId })), generation, original);
    },
    react: async (messageId: string, emoji: string, on: boolean) => {
      const target = { ...scope };
      const generation = browserScopeGeneration();
      const original = cacheIdentity();
      return settle(target, await withRetry(() => setConcernReaction({ academyId: target.academyId, concernId, messageId, emoji, on })), generation, original);
    },
    /** Call with the latest message seq actually shown; repeated or lower values send nothing. */
    markRead: async (seq: number) => {
      const target = { ...scope };
      const generation = browserScopeGeneration();
      const original = cacheIdentity();
      if (lastRead.current.scope !== readScope) lastRead.current = { scope: readScope, seq: 0 };
      const own = queryClient.getQueryData<ConcernDetail>(concernKeys.detail(target, concernId))
        ?.participants.find((participant) => participant.userId === target.userId)?.lastReadSeq ?? 0;
      if (seq <= Math.max(own, lastRead.current.seq)) return null;
      const progress = lastRead.current;
      progress.seq = seq;
      const result = await withRetry(() => markConcernRead({ academyId: target.academyId, concernId, seq }));
      if (generation !== browserScopeGeneration() || original !== cacheIdentity()) return result;
      if (result.ok) {
        queryClient.setQueryData<ConcernDetail>(concernKeys.detail(target, concernId), (current) => current && {
          ...current,
          participants: current.participants.map((participant) => participant.userId === target.userId
            ? { ...participant, lastReadSeq: result.lastReadSeq, readAt: result.readAt } : participant),
        });
        void invalidateConcernLists(queryClient, target);
      } else {
        // Allow a later attempt to try again.
        progress.seq = Math.min(progress.seq, own);
        if (result.code === "forbidden") { onDenied?.(); await forgetConcern(queryClient, target, concernId); }
      }
      return result;
    },
  };
}

/** Creates a concern with its opening message. Generate both ids once and reuse them on retry. */
export function useCreateConcern(scope: ConcernScope) {
  const queryClient = useQueryClient();
  return async (input: Omit<CreateConcernInput, "academyId">) => {
    const target = { ...scope };
    const generation = browserScopeGeneration();
    const result = await withRetry(() => createConcern({ ...input, academyId: target.academyId }));
    if (result.ok && generation === browserScopeGeneration()) void invalidateConcernLists(queryClient, target);
    return result;
  };
}
