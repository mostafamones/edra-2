// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useConcernInboxLive, useConcernLive } from "./live";
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
    subscribe: vi.fn((callback: (state: string) => void) => { result.subscription = callback; return result; }), track: vi.fn(),
    presenceState: () => ({ other: [{ typing: true, at: Date.now() }] }),
  };
  return result;
}
beforeEach(() => {
  vi.clearAllMocks(); api.channel.mockImplementation(channel); api.auth.mockResolvedValue(undefined);
  api.rpc.mockResolvedValue({ data: { id: "c", title: "Concern", status: "ongoing", createdAt: "now", createdBy: "self", settledAt: null, outcome: null, lastSeq: 0, muted: false,
    participants: [{ userId: "other", name: "Other", avatarPath: null, lastReadSeq: 0, readAt: null }] }, error: null });
});
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; vi.useRealTimers(); });

it("reauthorizes on explicit reconnect, cleans up old academy channels and ignores their late presence", async () => {
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
  expect(api.channel.mock.calls.at(-1)?.[0]).toBe("concern:b:c");
  act(() => first.events.get("presence:sync")!({ payload: {} }));
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
