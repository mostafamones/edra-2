// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const api = vi.hoisted(() => ({ markConcernRead: vi.fn() }));
vi.mock("./actions", () => ({ ...api, createConcern: vi.fn(), sendConcernMessage: vi.fn(),
  editConcernMessage: vi.fn(), deleteConcernMessage: vi.fn(), setConcernReaction: vi.fn() }));
import { useConcernCommands } from "./commands";

beforeEach(() => { api.markConcernRead.mockReset(); });
afterEach(cleanup);

function mount() {
  const client = new QueryClient();
  return renderHook(({ concernId }) => useConcernCommands({ academyId: "academy", userId: "user" }, concernId), {
    initialProps: { concernId: "first" },
    wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}

it("starts read progression independently when the selected concern changes", async () => {
  api.markConcernRead.mockImplementation(async ({ seq }) => ({ ok: true, lastReadSeq: seq, readAt: "now" }));
  const hook = mount();
  await hook.result.current.markRead(100);
  hook.rerender({ concernId: "second" });
  await hook.result.current.markRead(2);
  expect(api.markConcernRead.mock.calls.map(([value]) => [value.concernId, value.seq])).toEqual([["first", 100], ["second", 2]]);
});

it("allows another receipt attempt after a refused request", async () => {
  api.markConcernRead.mockResolvedValueOnce({ ok: false, code: "validation" })
    .mockResolvedValueOnce({ ok: true, lastReadSeq: 4, readAt: "now" });
  const hook = mount();
  await hook.result.current.markRead(4);
  await hook.result.current.markRead(4);
  expect(api.markConcernRead).toHaveBeenCalledTimes(2);
});

it("does not apply an old account/preview command to a new cache with the same scope key", async () => {
  const { advanceBrowserScope } = await import("@/lib/browser-scope");
  const { concernKeys } = await import("./queries");
  const client = new QueryClient();
  let finish!: (result: { ok: true; lastReadSeq: number; readAt: string }) => void;
  api.markConcernRead.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  const scope = { academyId: "academy", userId: "user" };
  const hook = renderHook(() => useConcernCommands(scope, "c"), {
    wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
  const request = hook.result.current.markRead(10);
  advanceBrowserScope();
  const detail = { participants: [{ userId: "user", lastReadSeq: 0, readAt: null }] };
  client.setQueryData(concernKeys.detail(scope, "c"), detail);
  finish({ ok: true, lastReadSeq: 10, readAt: "now" });
  await request;
  expect(client.getQueryData(concernKeys.detail(scope, "c"))).toEqual(detail);
  client.clear();
});

it("does not advance a recreated receipt cache after leaving and returning to the same academy", async () => {
  const { concernKeys, forgetConcernScope } = await import("./queries");
  const client = new QueryClient();
  const scope = { academyId: "academy", userId: "user" };
  const initial = { participants: [{ userId: "user", lastReadSeq: 0, readAt: null }] };
  client.setQueryData(concernKeys.detail(scope, "c"), initial);
  let finish!: (result: { ok: true; lastReadSeq: number; readAt: string }) => void;
  api.markConcernRead.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  const hook = renderHook(() => useConcernCommands(scope, "c"), {
    wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
  const request = hook.result.current.markRead(10);
  hook.unmount(); await forgetConcernScope(client, scope);
  client.setQueryData(concernKeys.detail(scope, "c"), initial);
  finish({ ok: true, lastReadSeq: 10, readAt: "now" }); await request;
  expect(client.getQueryData(concernKeys.detail(scope, "c"))).toEqual(initial);
  client.clear();
});
