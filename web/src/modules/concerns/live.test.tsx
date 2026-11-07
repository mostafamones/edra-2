// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useConcernInboxLive, useConcernLive } from "./live";
import { concernKeys } from "./queries";
const api = vi.hoisted(() => ({ channel: vi.fn(), removeChannel: vi.fn(), rpc: vi.fn(), auth: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ channel: api.channel, removeChannel: api.removeChannel, rpc: api.rpc, realtime: { setAuth: api.auth } }) }));
const clients: QueryClient[] = [];
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }); clients.push(client);
  return { client, wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> };
}
function channel() {
  const events = new Map<string, (event: { payload: Record<string, unknown> }) => void>();
  const result = {
    events, on: vi.fn((kind: string, filter: { event: string }, callback: (event: { payload: Record<string, unknown> }) => void) => { events.set(`${kind}:${filter.event}`, callback); return result; }),
    subscription: null as ((state: string) => void) | null,
    subscribe: vi.fn((callback: (state: string) => void) => { result.subscription = callback; return result; }),
  };
  return result;
}
beforeEach(() => {
  vi.clearAllMocks(); api.channel.mockImplementation(channel); api.auth.mockResolvedValue(undefined);
  api.rpc.mockResolvedValue({ data: { id: "c", title: "Concern", status: "ongoing", createdAt: "now", createdBy: "self", settledAt: null, outcome: null, lastSeq: 0, muted: false,
    version: 1, settledBy: null, settledByName: null, canManage: false,
    participants: [{ userId: "other", name: "Other", avatarPath: null, lastReadSeq: 0, readAt: null }] }, error: null });
});
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; vi.useRealTimers(); });

it("reauthorizes on explicit reconnect, cleans up old academy channels and ignores their late typing", async () => {
  const { wrapper } = setup();
  const hook = renderHook(({ academyId }) => useConcernLive({ scope: { academyId, userId: "self" }, concernId: "c", typing: false }), { wrapper, initialProps: { academyId: "a" } });
  await waitFor(() => expect(api.channel).toHaveBeenCalledTimes(1));
  const first = api.channel.mock.results[0].value as ReturnType<typeof channel>;
  await waitFor(() => expect(first.subscribe).toHaveBeenCalled());
  act(() => first.subscribe.mock.calls[0][0]("SUBSCRIBED"));
  expect(hook.result.current.status).toBe("live");
  act(() => hook.result.current.reconnect());
  await waitFor(() => expect(api.channel).toHaveBeenCalledTimes(2));
  expect(api.removeChannel).toHaveBeenCalledWith(first);
  hook.rerender({ academyId: "b" });
  await waitFor(() => expect(api.channel).toHaveBeenCalledTimes(3));
  expect(api.channel.mock.calls.at(-1)?.[0]).toBe("concern:b:c:self");
  act(() => first.events.get("broadcast:typing")!({ payload: { userId: "other", typing: true } }));
  expect(hook.result.current.typers).toEqual([]);
  hook.unmount(); expect(api.removeChannel).toHaveBeenCalledTimes(3);
});

it("removes the old inbox subscription and does not invalidate its scope from a late event", async () => {
  vi.useFakeTimers();
  const { wrapper, client } = setup();
  const invalidation = vi.spyOn(client, "invalidateQueries");
  const hook = renderHook(({ academyId }) => useConcernInboxLive({ academyId, userId: "self" }), { wrapper, initialProps: { academyId: "a" } });
  const first = api.channel.mock.results[0].value as ReturnType<typeof channel>;
  hook.rerender({ academyId: "b" });
  act(() => first.events.get("broadcast:activity")!({ payload: { concernId: "c" } }));
  await act(async () => vi.advanceTimersByTimeAsync(350));
  expect(invalidation).not.toHaveBeenCalled();
  expect(api.removeChannel).toHaveBeenCalledWith(first);
  expect(api.channel.mock.calls.at(-1)?.[0]).toBe("concern-inbox:self:b");
});

it("shows only database-attributed typing from current participants and publishes through the typing command", async () => {
  const { wrapper } = setup();
  const hook = renderHook(({ typing }) => useConcernLive({ scope: { academyId: "a", userId: "self" }, concernId: "c", typing }), { wrapper, initialProps: { typing: false } });
  await waitFor(() => expect(api.channel).toHaveBeenCalledTimes(1));
  expect(api.channel.mock.calls[0][1]).toEqual({ config: { private: true } });
  const live = api.channel.mock.results[0].value as ReturnType<typeof channel>;
  expect(live.events.has("presence:sync")).toBe(false);
  await waitFor(() => expect(live.subscribe).toHaveBeenCalled());
  act(() => live.subscribe.mock.calls[0][0]("SUBSCRIBED"));
  await waitFor(() => expect(api.rpc).toHaveBeenCalledWith("concern_detail", expect.anything()));
  act(() => live.events.get("broadcast:typing")!({ payload: { userId: "stranger", typing: true } }));
  act(() => live.events.get("broadcast:typing")!({ payload: { userId: "self", typing: true } }));
  expect(hook.result.current.typers).toEqual([]);
  act(() => live.events.get("broadcast:typing")!({ payload: { userId: "other", typing: true } }));
  await waitFor(() => expect(hook.result.current.typers).toEqual(["other"]));
  act(() => live.events.get("broadcast:typing")!({ payload: { userId: "other", typing: false } }));
  expect(hook.result.current.typers).toEqual([]);
  expect(api.rpc).not.toHaveBeenCalledWith("set_concern_typing", expect.anything());
  hook.rerender({ typing: true });
  await waitFor(() => expect(api.rpc).toHaveBeenCalledWith("set_concern_typing", { p_academy_id: "a", p_concern_id: "c", p_typing: true }));
  hook.rerender({ typing: false });
  await waitFor(() => expect(api.rpc).toHaveBeenCalledWith("set_concern_typing", { p_academy_id: "a", p_concern_id: "c", p_typing: false }));
});

it("purges a revoked concern through the inbox even when its conversation is collapsed", async () => {
  const { wrapper, client } = setup();
  const scope = { academyId: "a", userId: "self" };
  const key = concernKeys.thread(scope, "c");
  client.setQueryData(key, { messages: [{ body: "retained history" }], cursor: 1, hasMore: false });
  renderHook(() => useConcernInboxLive(scope), { wrapper });
  const inbox = api.channel.mock.results[0].value as ReturnType<typeof channel>;
  await act(async () => inbox.events.get("broadcast:revoked")!({ payload: { concernId: "c" } }));
  expect(client.getQueryData(key)).toBeUndefined();
});
