import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
const { load } = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("./queries", () => ({ assessmentsRootKey: (id: string) => ["assessments", id], loadAssessments: load }));
vi.mock("./params", () => ({ DEFAULT_PARAMS: { type: "all", search: "", statuses: [], pageSize: 24 } }));
import { assessmentCalendarOptions } from "./calendar";

describe("assessment calendar cache", () => {
  it("loads every page and reuses the result while fresh", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: false } } });
    load.mockReset().mockResolvedValueOnce({ items: [{ id: "first" }], total: 2 }).mockResolvedValueOnce({ items: [{ id: "second" }], total: 2 });
    const options = assessmentCalendarOptions("academy-a", "year-a");
    expect(await client.fetchQuery(options)).toEqual([{ id: "first" }, { id: "second" }]);
    await client.fetchQuery(options);
    expect(load).toHaveBeenCalledTimes(2);
    expect(load.mock.calls.map(call => call[2])).toEqual([0, 1]);
    expect(assessmentCalendarOptions("academy-b", "year-a").queryKey).not.toEqual(options.queryKey);
    expect(assessmentCalendarOptions("academy-a", "year-b").queryKey).not.toEqual(options.queryKey);
    await client.invalidateQueries({ queryKey: ["assessments", "academy-a"] });
    expect(client.getQueryState(options.queryKey)?.isInvalidated).toBe(true);
    client.clear();
  });
  it("rejects a prematurely empty page instead of presenting an incomplete calendar as complete", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    load.mockReset().mockResolvedValue({ items: [], total: 3 });
    await expect(client.fetchQuery(assessmentCalendarOptions("a", "y"))).rejects.toThrow("catalog changed");
    client.clear();
  });
});
