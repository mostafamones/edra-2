// @vitest-environment jsdom
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_LIST_PARAMS } from "./list-params";
import { studentListQueryKey, studentRecordQueryKey } from "./queries";
import { useStudentSuspension, type SuspensionTarget } from "./use-suspension";

const mocks = vi.hoisted(() => ({ preview: vi.fn(), set: vi.fn(), success: vi.fn(), warning: vi.fn(), current: true }));
vi.mock("./suspension", () => ({ previewStudentSuspension: mocks.preview, setStudentSuspension: mocks.set }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, warning: mocks.warning, error: vi.fn() } }));
vi.mock("@/modules/auth", () => ({ useAcademyScope: () => () => mocks.current }));

const listKey = studentListQueryKey("a", DEFAULT_LIST_PARAMS);
const row = (id: string, manuallySuspended: boolean, onlineAccount: string, archivedAt: string | null = null) => ({ id, manuallySuspended, onlineAccount, archivedAt });
const target = (recordId: string, suspended: boolean, revision = 0, archived = false): SuspensionTarget => ({ recordId, suspended, revision, archived });
const changed = { ok: true, data: { changed: [{ recordId: "r1", profileId: "p", revision: 1 }], unchanged: [] } };

function setup(cache = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  // r1 linked, r2 unlinked, r3 linked and archived and already suspended.
  cache.setQueryData(listKey, { rows: [row("r1", false, "connected"), row("r2", false, "not_connected"), row("r3", true, "suspended", "x")], total: 3 });
  cache.setQueryData(studentRecordQueryKey("a", "r1"), row("r1", false, "connected"));
  const reopen = vi.fn();
  const { result } = renderHook(() => useStudentSuspension("a", { reopen }), {
    wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={cache}>{children}</QueryClientProvider>,
  });
  const rows = () => (cache.getQueryData(listKey) as { rows: ReturnType<typeof row>[] }).rows.map((item) => `${item.manuallySuspended}:${item.onlineAccount}`);
  return { cache, reopen, result, rows };
}

describe("student suspension writes", () => {
  beforeEach(() => { for (const mock of [mocks.preview, mocks.set, mocks.success, mocks.warning]) mock.mockReset(); mocks.current = true; });

  it("shows the change before the server answers, keeping link semantics", async () => {
    let answer!: (value: unknown) => void;
    mocks.set.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    const { cache, result, rows } = setup();
    let write!: Promise<void>;
    await act(async () => { write = result.current.submit({ suspend: true, targets: [target("r1", false), target("r2", false), target("r3", true, 1, true)] }, " x "); await Promise.resolve(); await Promise.resolve(); });
    expect(rows()).toEqual(["true:suspended", "true:not_connected", "true:suspended"]);
    expect(cache.getQueryData<{ manuallySuspended: boolean }>(studentRecordQueryKey("a", "r1"))?.manuallySuspended).toBe(true);
    await act(async () => { answer(changed); await write; });
    expect(mocks.set).toHaveBeenCalledWith({ academyId: "a", records: [{ id: "r1", revision: 0 }, { id: "r2", revision: 0 }, { id: "r3", revision: 1 }], suspended: true, reason: " x " });
    expect(mocks.success).toHaveBeenCalledWith("Suspended online access for 1 student.");
  });

  it("restoring an archived record leaves its account suspended", async () => {
    mocks.set.mockReturnValue(new Promise(() => {}));
    const { result, rows } = setup();
    await act(async () => { void result.current.submit({ suspend: false, targets: [target("r3", true, 1, true)] }, ""); await Promise.resolve(); await Promise.resolve(); });
    expect(rows()[2]).toBe("false:suspended");
  });

  it("undoes only what it showed and reopens with the reason and fresh state when stale", async () => {
    mocks.set.mockResolvedValue({ ok: false, code: "stale_suspension", message: "Changed since review." });
    mocks.preview.mockResolvedValue({ ok: true, data: [{ recordId: "r1", profileId: "p", fullName: "r1", archived: false, yearClosed: false, connected: true, suspended: false, revision: 4 }] });
    const { result, rows, reopen } = setup();
    await act(async () => { await result.current.submit({ suspend: true, targets: [target("r1", false), target("r3", true, 1, true)], name: undefined }, "Unpaid"); });
    expect(rows()).toEqual(["false:connected", "false:not_connected", "true:suspended"]);
    expect(reopen).toHaveBeenCalledWith(expect.objectContaining({ reason: "Unpaid", error: "Changed since review.", missing: 1, targets: [target("r1", false, 4)] }));
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("reopens with the same targets when the server is unreachable", async () => {
    mocks.set.mockRejectedValue(new Error("offline"));
    const { result, reopen, rows } = setup();
    await act(async () => { await result.current.submit({ suspend: true, targets: [target("r1", false)], name: "Amal" }, "r"); });
    expect(rows()[0]).toBe("false:connected");
    expect(reopen).toHaveBeenCalledWith(expect.objectContaining({ name: "Amal", reason: "r", targets: [target("r1", false)] }));
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it("keeps an acknowledged change when the refresh fails and retries only the refresh", async () => {
    mocks.set.mockResolvedValue(changed);
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const unwatch = new QueryObserver(cache, { queryKey: studentRecordQueryKey("a", "r9"), queryFn: () => Promise.reject(new Error("offline")) }).subscribe(() => {});
    const { result } = setup(cache);
    await act(async () => { await result.current.submit({ suspend: true, targets: [target("r1", false)], name: "Amal" }, ""); });
    const [message, options] = mocks.warning.mock.calls[0];
    expect(message).toBe("Suspended online access for Amal. Couldn’t refresh students.");
    options.action.onClick();
    expect(mocks.set).toHaveBeenCalledTimes(1);
    unwatch();
  });

  it("stays silent when the academy changed before the answer", async () => {
    mocks.set.mockResolvedValue({ ok: false, code: "unavailable", message: "Down" });
    const { result, reopen } = setup();
    mocks.current = false;
    await act(async () => { await result.current.submit({ suspend: true, targets: [target("r1", false)] }, ""); });
    expect(reopen).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });
});
