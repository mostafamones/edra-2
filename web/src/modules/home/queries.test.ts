import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

const api = vi.hoisted(() => ({ live: vi.fn(), history: vi.fn() }));
vi.mock("@/modules/sessions", () => ({
  fetchLiveSessions: api.live, fetchSessionHistory: api.history,
  liveSessionsQueryKey: (id: string) => ["sessions", id, "live"],
  historyQueryKey: (id: string, filter: { archive: string; search: string; from: null; to: null }) => ["sessions", id, "history", filter.archive, filter.search, filter.from, filter.to],
}));
import { homeLiveOptions, homeRecentOptions } from "./queries";

describe("Home session cache", () => {
  it("reuses fresh Sessions pages and keeps academy reads separate", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: false } } });
    const page = { sessions: [], nextCursor: null };
    client.setQueryData(["sessions", "a", "live"], { pages: [page], pageParams: [null] });
    await client.fetchInfiniteQuery(homeLiveOptions("a"));
    expect(api.live).not.toHaveBeenCalled();
    api.live.mockResolvedValue(page);
    await client.fetchInfiniteQuery(homeLiveOptions("b"));
    expect(api.live).toHaveBeenCalledOnce();
    expect(api.live).toHaveBeenCalledWith("b", null, expect.any(AbortSignal));
    client.clear();
  });

  it("uses the unfiltered unarchived history contract without fetching details", async () => {
    const client = new QueryClient();
    api.history.mockResolvedValue({ sessions: [], nextCursor: null });
    await client.fetchInfiniteQuery(homeRecentOptions("a"));
    expect(api.history).toHaveBeenCalledWith("a", { search: "", from: null, to: null, archive: "active" }, null, expect.any(AbortSignal));
    client.clear();
  });
});
