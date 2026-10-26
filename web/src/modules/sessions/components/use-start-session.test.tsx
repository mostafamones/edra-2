// @vitest-environment jsdom
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const mocks = vi.hoisted(() => ({ start: vi.fn(), push: vi.fn(), current: vi.fn(), uuid: vi.fn(), error: vi.fn() }));
vi.mock("../actions", () => ({ startSession: mocks.start }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/modules/navigation", () => ({ useCanonicalHref: () => (path: string) => path }));
vi.mock("@/modules/auth", () => ({ useAcademyScope: () => mocks.current }));
vi.mock("@/lib/uuid", () => ({ newUuid: mocks.uuid }));
vi.mock("sonner", () => ({ toast: { error: mocks.error, info: vi.fn() } }));
import { useStartSession } from "./use-start-session";
beforeEach(() => { vi.clearAllMocks(); mocks.current.mockReturnValue(true); mocks.uuid.mockReturnValueOnce("key-1").mockReturnValueOnce("key-2"); });
afterEach(cleanup);
function renderStart() {
  const client = new QueryClient();
  return renderHook(function useTestSession() { return useStartSession("academy"); }, { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
}
it("retains the start receipt key after a lost response and navigates after retry", async () => {
  mocks.start.mockResolvedValueOnce({ ok: false, code: "unavailable", message: "Connection lost" }).mockResolvedValueOnce({ ok: true, outcome: "replayed", sessionId: "original" });
  const { result } = renderStart();
  await act(async () => { expect(await result.current.start("schedule")).toBe(false); });
  await act(async () => { expect(await result.current.start("schedule")).toBe(true); });
  expect(mocks.start.mock.calls.map(([input]) => input.startKey)).toEqual(["key-1", "key-1"]);
  expect(mocks.push).toHaveBeenCalledWith("/app/attendance/original");
});
it("blocks same-tick repeated starts before React updates pending state", async () => {
  let finish!: (result: unknown) => void;
  mocks.start.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const { result } = renderStart();
  await act(async () => {
    const first = result.current.start("schedule");
    expect(await result.current.start("schedule")).toBe(false);
    expect(mocks.start).toHaveBeenCalledOnce();
    finish({ ok: true, outcome: "created", sessionId: "new" }); await first;
  });
});
it("does not navigate to an old academy after authority context changes", async () => {
  mocks.start.mockImplementation(async () => { mocks.current.mockReturnValue(false); return { ok: true, outcome: "created", sessionId: "old" }; });
  const { result } = renderStart();
  await act(async () => { expect(await result.current.start("schedule")).toBe(false); });
  expect(mocks.push).not.toHaveBeenCalled();
});
