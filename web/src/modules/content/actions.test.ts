import { beforeEach, expect, it, vi } from "vitest";

const reads = vi.hoisted(() => ({ history: vi.fn(), sources: vi.fn(), caller: vi.fn(), rpc: vi.fn() }));
vi.mock("./data", () => ({
  readUnitHistory: reads.history, readReuseSources: reads.sources, contentCaller: reads.caller,
  contentError: (error: { message: string } | null) => { if (error) throw new Error(error.message); },
  contentResult: async (run: () => Promise<unknown>) => {
    try { return { ok: true, value: await run() }; }
    catch (error) { return { ok: false, message: (error as Error).message }; }
  },
}));
import { loadUnitPanels } from "./actions";

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
