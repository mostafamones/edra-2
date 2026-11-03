import { beforeEach, expect, it, vi } from "vitest";
import { throughTransport } from "@/modules/transport.test-support";

const reads = vi.hoisted(() => ({ history: vi.fn(), sources: vi.fn(), caller: vi.fn(), rpc: vi.fn() }));
vi.mock("./data", () => ({
  readUnitHistory: reads.history, readReuseSources: reads.sources, readUnitPublication: vi.fn(), contentCaller: reads.caller,
  contentError: (error: { message: string } | null) => { if (error) throw new Error(error.message); },
  contentResult: async (run: () => Promise<unknown>) => {
    try { return { ok: true, value: await run() }; }
    catch (error) { return { ok: false, message: (error as Error).message }; }
  },
}));
import { cancelUnitPublication, loadUnitPanels, saveUnit, scheduleUnitPublication } from "./actions.server";

const academyId = "11111111-1111-4111-8111-111111111111", unitId = "22222222-2222-4222-8222-222222222222";
beforeEach(() => {
  vi.clearAllMocks();
  reads.history.mockResolvedValue({ drafts: [], revisions: [] });
  reads.sources.mockResolvedValue([]);
  reads.caller.mockResolvedValue({ db: { rpc: reads.rpc } });
  reads.rpc.mockResolvedValue({ data: [], error: null });
});

it("starts independent panel reads before history finishes", async () => {
  let finishHistory!: (value: unknown) => void;
  reads.history.mockReturnValue(new Promise(resolve => { finishHistory = resolve; }));
  const pending = loadUnitPanels(academyId, unitId);
  await vi.waitFor(() => expect(reads.rpc).toHaveBeenCalled());
  expect(reads.sources).toHaveBeenCalledWith(academyId, unitId);
  finishHistory({ drafts: [], revisions: [] });
  expect(await pending).toMatchObject({ history: { ok: true }, assessments: { ok: true }, sources: { ok: true } });
});

it("preserves successful panels when one read fails", async () => {
  reads.history.mockRejectedValue(new Error("History unavailable"));
  expect(await loadUnitPanels(academyId, unitId)).toEqual({
    history: { ok: false, message: "History unavailable" },
    assessments: { ok: true, value: [] }, sources: { ok: true, value: [] },
  });
});

it("transports panel data and the explicit undefined save result", async () => {
  const panels = await loadUnitPanels(academyId, unitId);
  expect(await throughTransport(panels)).toEqual(panels);
  const saved = await saveUnit({ academyId, unitId, version: 1, document: { title: "Unit", description: "", accessDays: 7, items: [] } });
  expect(saved).toEqual({ ok: true, value: undefined });
  const result = await throughTransport(saved);
  expect(result).toEqual(saved);
  expect(Object.hasOwn(result, "value")).toBe(true);
});

it("converts a Cairo wall time to one instant for the database", async () => {
  reads.rpc.mockResolvedValue({ data: { state: "pending", generation: 1, scheduledFor: "2099-01-15T10:30:00+00:00" }, error: null });
  const result = await scheduleUnitPublication({ academyId, unitId, date: "2099-01-15", time: "12:30", generation: 0 });
  expect(result.ok).toBe(true);
  expect(reads.rpc).toHaveBeenCalledWith("schedule_content_publication", { p_academy_id: academyId, p_unit_id: unitId, p_at: "2099-01-15T10:30:00.000Z", p_generation: 0 });
  // Summer time moves the same wall clock an hour.
  await scheduleUnitPublication({ academyId, unitId, date: "2099-07-15", time: "12:30", generation: 0 });
  expect(reads.rpc).toHaveBeenLastCalledWith("schedule_content_publication", expect.objectContaining({ p_at: "2099-07-15T09:30:00.000Z" }));
});

it("refuses a Cairo time that doesn't exist without calling the database", async () => {
  expect(await scheduleUnitPublication({ academyId, unitId, date: "2099-02-31", time: "12:30", generation: 0 })).toMatchObject({ ok: false });
  expect(await scheduleUnitPublication({ academyId, unitId, date: "2099-04-24", time: "00:30", generation: 0 })).toMatchObject({ ok: false });
  expect(reads.rpc).not.toHaveBeenCalled();
});

it("reports the schedule's actual state", async () => {
  reads.rpc.mockResolvedValue({ data: { state: "published", generation: 4, scheduledFor: "2099-01-15T10:30:00+00:00" }, error: null });
  expect(await cancelUnitPublication({ academyId, unitId, generation: 3 })).toMatchObject({ ok: true, value: { state: "published" } });
});

it("rejects another caller's database refusal as a failure", async () => {
  reads.rpc.mockResolvedValue({ data: null, error: { message: "forbidden" } });
  expect(await scheduleUnitPublication({ academyId, unitId, date: "2099-01-15", time: "12:30", generation: 0 })).toMatchObject({ ok: false });
});
