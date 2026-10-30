import { beforeEach, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ from: api.from }) }));
import { loadStaffUnitMaterials } from "./staff";

const academy = "11111111-1111-4111-8111-111111111111", unit = "22222222-2222-4222-8222-222222222222";
const material = { id: "33333333-3333-4333-8333-333333333333", title: "Published video", kind: "explanation" };
const query = () => {
  const q = { select: vi.fn(), eq: vi.fn(), abortSignal: vi.fn(), single: vi.fn() };
  for (const method of [q.select, q.eq, q.abortSignal]) method.mockReturnValue(q);
  return q;
};
beforeEach(() => vi.clearAllMocks());

it("reads labels from the exact published revision, scoped to academy and unit", async () => {
  const header = query(), revision = query();
  header.single.mockResolvedValue({ data: { published_revision: 3 }, error: null });
  revision.single.mockResolvedValue({ data: { document: { items: [material] } }, error: null });
  api.from.mockImplementation(table => table === "content_units" ? header : revision);
  const signal = new AbortController().signal;
  expect(await loadStaffUnitMaterials(academy, unit, signal)).toEqual([material]);
  expect(header.select).toHaveBeenCalledWith("published_revision");
  expect(header.eq.mock.calls).toEqual([["academy_id", academy], ["id", unit]]);
  expect(revision.eq.mock.calls).toEqual([["academy_id", academy], ["unit_id", unit], ["revision", 3]]);
  expect(header.abortSignal).toHaveBeenCalledWith(signal);
  expect(revision.abortSignal).toHaveBeenCalledWith(signal);
});

it("stops when the unit is inaccessible instead of reading revision history", async () => {
  const header = query();
  header.single.mockResolvedValue({ data: null, error: { message: "denied" } });
  api.from.mockReturnValue(header);
  await expect(loadStaffUnitMaterials(academy, unit, new AbortController().signal)).rejects.toThrow("unavailable");
  expect(api.from.mock.calls).toEqual([["content_units"]]);
});
