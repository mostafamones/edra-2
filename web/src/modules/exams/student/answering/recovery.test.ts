import { beforeEach, describe, expect, it, vi } from "vitest";
import { JOURNAL_SCHEMA, type JournalEntry, type JournalStore } from "./journal";
const api = vi.hoisted(() => ({ departure: vi.fn() }));
vi.mock("../actions", () => ({ recordStudentExamDeparture: api.departure }));
import { recoverDeparture } from "./recovery";

const entry = (): JournalEntry => ({ schema: JOURNAL_SCHEMA, accountId: "account", attemptId: "attempt", examId: "exam",
  seq: 1, drafts: { q: { value: { choiceId: null, text: "pending" }, baseline: { choiceId: null, text: null }, seq: 1 } },
  inflight: null, submission: null, departure: { eventId: "event", questionId: "q", generation: 1 }, updatedAt: 0 });
function store() {
  const rows = new Map<string, unknown>([["account:attempt", entry()], ["other:attempt", { ...entry(), accountId: "other" }]]);
  const journal: JournalStore = { keys: async () => [...rows.keys()], get: async (key) => rows.get(key),
    put: async (key, value) => { rows.set(key, value); }, delete: async (key) => { rows.delete(key); } };
  return { journal, rows };
}
beforeEach(() => { api.departure.mockReset(); });
describe("departure recovery before claiming", () => {
  it("delivers the original generation and clears only the acknowledged event", async () => {
    const { journal, rows } = store(); api.departure.mockResolvedValue({ ok: true, kind: "warned" });
    expect(await recoverDeparture("account", "academy", "exam", "old-token", journal)).toEqual({ ok: true });
    expect(api.departure).toHaveBeenCalledWith({ academyId: "academy", examId: "exam", token: "old-token", generation: 1, eventId: "event", questionId: "q" });
    expect(rows.get("account:attempt")).toMatchObject({ departure: null, drafts: { q: expect.anything() } });
    expect(rows.get("other:attempt")).toMatchObject({ departure: { eventId: "event" } });
  });
  it("keeps an uncertain event intact and blocks reacquisition until its outcome is resolved", async () => {
    const { journal, rows } = store(); api.departure.mockRejectedValue(new Error("offline"));
    expect(await recoverDeparture("account", "academy", "exam", "old-token", journal)).toMatchObject({ ok: false });
    expect(rows.get("account:attempt")).toMatchObject({ departure: { generation: 1, eventId: "event" } });
  });
  it("still permits in-memory answering when storage itself is unavailable", async () => {
    const { journal } = store(); journal.keys = async () => { throw Error("blocked"); };
    expect(await recoverDeparture("account", "academy", "exam", null, journal)).toEqual({ ok: true });
    expect(api.departure).not.toHaveBeenCalled();
  });
});
