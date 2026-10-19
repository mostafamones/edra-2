import { describe, expect, it, vi } from "vitest";
import { physicalSave } from "./physical-save";

const initial = { version: 1, physicalDraft: { version: 1 }, submission: null as { source: string } | null };
const payload = { values: { choice: "a", written: "2" }, answers: [{ questionId: "choice", value: "a" }, { questionId: "written", value: "2" }], marks: [] };
const success = (student: typeof initial, outcome = "saved") => ({ ok: true as const, outcome, student });

describe("staged physical work save", () => {
  it("retries only the unacknowledged stage with its original key and version", async () => {
    const accepted = { ...initial, version: 2, physicalDraft: { version: 2 }, submission: { source: "physical" } };
    const draft = vi.fn().mockResolvedValue(success({ ...initial, physicalDraft: { version: 2 } }));
    const confirm = vi.fn().mockResolvedValue(success(accepted, "confirmed"));
    const marks = vi.fn().mockResolvedValueOnce({ ok: false, code: "unavailable", message: "Unknown" }).mockResolvedValue(success({ ...accepted, version: 3 }));
    const acknowledged = vi.fn();
    const run = physicalSave(payload, { initial, choiceIds: new Set(["choice"]), current: () => true, draft, confirm, marks, acknowledged,
      done: () => ({ ok: true, saved: true }) });
    expect(await run()).toMatchObject({ ok: false, uncertain: true });
    expect(await run()).toMatchObject({ ok: true, saved: true });
    expect(draft).toHaveBeenCalledOnce(); expect(confirm).toHaveBeenCalledOnce();
    expect(marks.mock.calls[1]).toEqual(marks.mock.calls[0]);
    expect(marks.mock.calls[1][0]).toBe(2);
  });

  it("stops on competing online acceptance without mixing in physical marks", async () => {
    const marks = vi.fn();
    const run = physicalSave(payload, { initial, choiceIds: new Set(["choice"]), current: () => true,
      draft: vi.fn().mockResolvedValue(success(initial)), confirm: vi.fn().mockResolvedValue(success({ ...initial, submission: { source: "online" } }, "source_conflict")),
      marks, acknowledged: vi.fn(), done: vi.fn() });
    expect(await run()).toMatchObject({ ok: true, saved: false }); expect(marks).not.toHaveBeenCalled();
  });
});
