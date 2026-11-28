// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { advanceBrowserScope } from "@/lib/browser-scope";
import { concernKeys, forgetConcernScope, loadConcernTarget, useConcernInbox, useConcernSearch, useConcernThread, useConcernUnread } from "./queries";
import type { ConcernMessage, ConcernThread } from "./validation";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc }) }));
const scope = { academyId: "academy-a", userId: "user-a" };
const clients: QueryClient[] = [];
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }); clients.push(client);
  return { client, wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> };
}
function message(seq: number): ConcernMessage { return { id: `m${seq}`, concernId: "c", seq, revision: seq, authorId: "a", authorName: "A", body: `Text ${seq}`, mentions: [], createdAt: "now", editedAt: null, deletedAt: null, replyTo: null, reactions: [], attachments: [] }; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { resolve, promise }; }
beforeEach(() => { rpc.mockReset(); });
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; vi.useRealTimers(); });

it("does not read optional hidden inbox/thread/search; unread is a separate server total", async () => {
  const { wrapper } = setup();
  rpc.mockResolvedValue({ data: { concerns: 8, messages: 100, mentions: 3 }, error: null });
  const hook = renderHook(() => { useConcernInbox(scope, "ongoing", false); useConcernThread(scope, "c", false); useConcernSearch(scope, "query", false); return useConcernUnread(scope); }, { wrapper });
  await waitFor(() => expect(hook.result.current.data?.messages).toBe(100));
  expect(rpc.mock.calls.map(([name]) => name)).toEqual(["concern_unread"]);
});

it("debounces remote input and suppresses a late search response after the input changes", async () => {
  const { wrapper } = setup();
  const old = deferred<{ data: unknown[]; error: null }>();
  rpc.mockImplementation((_name, input) => input.p_query === "old" ? old.promise : Promise.resolve({ data: [], error: null }));
  const hook = renderHook(({ input }) => useConcernSearch(scope, input), { wrapper, initialProps: { input: "old" } });
  expect(rpc).not.toHaveBeenCalled();
  await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
  hook.rerender({ input: "new" });
  expect(hook.result.current.data).toBeUndefined();
  await act(async () => old.resolve({ data: [{ concernId: "c", title: "Old private result", status: "ongoing", messageId: null, seq: null, body: null, authorName: null, createdAt: "now" }], error: null }));
  expect(hook.result.current.data).toBeUndefined();
  await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(hook.result.current.data).toEqual([]));
});

it("bridges a historical search target without gaps, cursor advance or losing newer revisions", async () => {
  const { client } = setup();
  const all = Array.from({ length: 150 }, (_, index) => message(index + 1));
  client.setQueryData<ConcernThread>(concernKeys.thread(scope, "c"), { messages: all.slice(100), cursor: 170, hasMore: true });
  rpc.mockImplementation(async (_name, input) => {
    const available = all.filter((item) => item.seq < Number(input.p_before_seq ?? 151));
    return { data: { messages: available.slice(-50), hasMore: available.length > 50, cursor: 999 }, error: null };
  });
  await loadConcernTarget(client, scope, "c", { messageId: "m20", seq: 20 });
  const thread = client.getQueryData<ConcernThread>(concernKeys.thread(scope, "c"))!;
  expect(rpc.mock.calls.map(([, input]) => input.p_before_seq)).toEqual([21, 101, 51]);
  expect(thread.messages.map((item) => item.seq)).toEqual(all.map((item) => item.seq));
  expect(thread.cursor).toBe(170); expect(thread.hasMore).toBe(false);
});

it("does not reopen old paging when a searched message is already in the complete window", async () => {
  const { client } = setup();
  client.setQueryData<ConcernThread>(concernKeys.thread(scope, "c"), { messages: [message(1), message(2)], cursor: 20, hasMore: false });
  rpc.mockResolvedValue({ data: { messages: [message(2)], cursor: 100, hasMore: true }, error: null });
  await loadConcernTarget(client, scope, "c", { messageId: "m2", seq: 2 });
  expect(client.getQueryData<ConcernThread>(concernKeys.thread(scope, "c"))?.hasMore).toBe(false);
  expect(client.getQueryData<ConcernThread>(concernKeys.thread(scope, "c"))?.cursor).toBe(20);
});

it("locates an ID-only activation by paging and reports a missing target instead of false success", async () => {
  const { client } = setup();
  client.setQueryData<ConcernThread>(concernKeys.thread(scope, "c"), { messages: [message(2)], cursor: 2, hasMore: true });
  rpc.mockResolvedValue({ data: { messages: [message(1)], cursor: 2, hasMore: false }, error: null });
  await loadConcernTarget(client, scope, "c", { messageId: "m1" });
  await expect(loadConcernTarget(client, scope, "c", { messageId: "missing" })).rejects.toThrow("unavailable");
});

it("exposes older-page failure for retry and prevents a late page from repopulating a cleared scope", async () => {
  const { wrapper, client } = setup();
  rpc.mockResolvedValueOnce({ data: { messages: [message(2)], cursor: 2, hasMore: true }, error: null });
  const hook = renderHook(() => useConcernThread(scope, "c"), { wrapper });
  await waitFor(() => expect(hook.result.current.data?.messages).toHaveLength(1));
  rpc.mockResolvedValueOnce({ data: null, error: { code: "500" } });
  await act(async () => hook.result.current.loadOlder());
  expect(hook.result.current.olderError).toBeTruthy();
  const late = deferred<{ data: ConcernThread; error: null }>(); rpc.mockReturnValueOnce(late.promise);
  let loading!: Promise<void>; act(() => { loading = hook.result.current.loadOlder(); });
  hook.unmount(); advanceBrowserScope(); await forgetConcernScope(client, scope);
  await act(async () => { late.resolve({ data: { messages: [message(1)], cursor: 2, hasMore: false }, error: null }); await loading; });
  expect(client.getQueriesData({ queryKey: concernKeys.scope(scope) })).toEqual([]);
});

it("fences a late older page even when the same academy/account is reopened with a new query", async () => {
  const { wrapper, client } = setup();
  rpc.mockResolvedValueOnce({ data: { messages: [message(2)], cursor: 2, hasMore: true }, error: null });
  const hook = renderHook(() => useConcernThread(scope, "c"), { wrapper });
  await waitFor(() => expect(hook.result.current.data?.messages).toHaveLength(1));
  const late = deferred<{ data: ConcernThread; error: null }>(); rpc.mockReturnValueOnce(late.promise);
  let loading!: Promise<void>; act(() => { loading = hook.result.current.loadOlder(); });
  hook.unmount(); await forgetConcernScope(client, scope);
  const fresh = { messages: [message(20)], cursor: 100, hasMore: true };
  client.setQueryData(concernKeys.thread(scope, "c"), fresh);
  await act(async () => { late.resolve({ data: { messages: [message(1)], cursor: 2, hasMore: false }, error: null }); await loading; });
  expect(client.getQueryData(concernKeys.thread(scope, "c"))).toEqual(fresh);
});
