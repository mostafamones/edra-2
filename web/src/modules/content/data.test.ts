import { beforeEach, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ authority: vi.fn(), from: vi.fn(), membership: vi.fn(), range: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/authority", () => ({ cookieAuthority: api.authority }));
vi.mock("@/modules/academies/structure", () => ({ readOfferingTrackLabels: vi.fn() }));
import { readReuseSources } from "./data";

const academyId = "11111111-1111-4111-8111-111111111111", unitId = "22222222-2222-4222-8222-222222222222";
const query = { select: vi.fn(), eq: vi.fn(), neq: vi.fn(), order: vi.fn(), limit: vi.fn(), range: api.range };
const document = { title: "Published title", description: "", accessDays: 7, items: [] };

beforeEach(() => {
  vi.clearAllMocks();
  for (const method of [query.select, query.eq, query.neq, query.order, query.limit]) method.mockReturnValue(query);
  api.authority.mockResolvedValue({ userId: "staff", db: { from: api.from } });
  const membership = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), maybeSingle: api.membership };
  for (const method of [membership.select, membership.eq, membership.is]) method.mockReturnValue(membership);
  api.from.mockImplementation(table => table === "academy_memberships" ? membership : query);
  api.membership.mockResolvedValue({ data: { role: "instructor" }, error: null });
  api.range.mockResolvedValue({ data: [], error: null });
});

it("rejects callers without an active academy membership before reading sources", async () => {
  api.membership.mockResolvedValue({ data: null, error: null });
  await expect(readReuseSources(academyId, unitId)).rejects.toThrow("no longer have access");
  expect(api.from).not.toHaveBeenCalledWith("content_units");
});

it("uses published snapshots, scopes the academy and excludes the target unit", async () => {
  api.range.mockResolvedValue({ data: [{ id: "source", title: "Current title", revisions: [{ document }] }, { id: "missing", title: "No publication", revisions: [] }], error: null });
  expect(await readReuseSources(academyId, unitId)).toEqual([{ id: "source", title: "Current title", items: [] }]);
  expect(query.eq).toHaveBeenCalledWith("academy_id", academyId);
  expect(query.eq).toHaveBeenCalledWith("state", "published");
  expect(query.neq).toHaveBeenCalledWith("id", unitId);
  expect(query.order).toHaveBeenCalledWith("revision", { referencedTable: "revisions", ascending: false });
  expect(query.limit).toHaveBeenCalledWith(1, { referencedTable: "revisions" });
});

it("loads all source pages without fetching full details for every unit", async () => {
  const row = { id: "source", title: "Lesson", revisions: [{ document }] };
  api.range.mockResolvedValueOnce({ data: Array.from({ length: 500 }, () => row), error: null })
    .mockResolvedValueOnce({ data: [row], error: null });
  expect(await readReuseSources(academyId, unitId)).toHaveLength(501);
  expect(api.range.mock.calls).toEqual([[0, 499], [500, 999]]);
  expect(api.from.mock.calls).toEqual([["academy_memberships"], ["content_units"], ["content_units"]]);
});
