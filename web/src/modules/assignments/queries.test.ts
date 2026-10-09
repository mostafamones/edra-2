import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StudentWork } from "./types";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), eq: vi.fn(), in: vi.fn(), list: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc: mocks.rpc, from: mocks.from }) }));
vi.mock("./mapper", async (original) => ({ ...await original<typeof import("./mapper")>(), toStudentList: mocks.list }));

import { loadMarks } from "./queries";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: {}, error: null });
  mocks.from.mockReturnValue({ select: () => ({ eq: mocks.eq }) });
  mocks.eq.mockReturnValue({ in: mocks.in });
});

describe("marks placement filters", () => {
  it("keeps equally named groups distinct and scopes placement reads to the academy's recipients", async () => {
    mocks.list.mockReturnValue({ total: 2, students: [
      { recordId: "a", groupName: "Monday" }, { recordId: "b", groupName: "Monday" },
    ] as StudentWork[] });
    mocks.in.mockResolvedValue({ data: [
      { id: "a", primary_group_id: "g1", track_id: "t1", academy_tracks: { name: "Science" } },
      { id: "b", primary_group_id: "g2", track_id: null, academy_tracks: null },
    ], error: null });
    const result = await loadMarks("academy", "assignment");
    expect(mocks.eq).toHaveBeenCalledWith("academy_id", "academy");
    expect(mocks.in).toHaveBeenCalledWith("id", ["a", "b"]);
    expect(result.students.map((row) => row.placement)).toEqual([
      { groupId: "g1", trackId: "t1", trackName: "Science" },
      { groupId: "g2", trackId: null, trackName: null },
    ]);
  });

  it("loads placements for a full roster without sending all IDs in one URL", async () => {
    mocks.list.mockReturnValue({ total: 1000, students: Array.from({ length: 1000 }, (_, i) => ({ recordId: `${i}` })) });
    mocks.in.mockImplementation(async (_column, ids: string[]) => ({
      data: ids.map((id) => ({ id, primary_group_id: null, track_id: null, academy_tracks: null })), error: null,
    }));
    const result = await loadMarks("academy", "assignment");
    expect(result.students).toHaveLength(1000);
    expect(result.students.every((row) => row.placement?.groupId === null)).toBe(true);
    expect(mocks.in.mock.calls.every(([, ids]) => ids.length <= 100)).toBe(true);
  });

  it("surfaces failed placement reads instead of returning misleading filter results", async () => {
    mocks.list.mockReturnValue({ total: 1, students: [{ recordId: "a" }] });
    mocks.in.mockResolvedValue({ data: null, error: { message: "Access denied" } });
    await expect(loadMarks("academy", "assignment")).rejects.toThrow("Access denied");
  });
});
