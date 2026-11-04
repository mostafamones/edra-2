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
