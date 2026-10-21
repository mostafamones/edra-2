// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JOURNAL_SCHEMA, type JournalEntry, type JournalStore } from "./journal";
const api = vi.hoisted(() => ({ departure: vi.fn() }));
vi.mock("../actions", () => ({ recordStudentExamDeparture: api.departure }));
import { readBreadcrumbs, writeBreadcrumb } from "../departures/breadcrumb";
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
beforeEach(() => { api.departure.mockReset(); localStorage.clear(); });
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
  it("reports token loss once, preserves answers and permits a subsequent legitimate resume", async () => {
    const { journal, rows } = store();
    expect(await recoverDeparture("account", "academy", "exam", null, journal)).toMatchObject({ ok: false });
    expect(rows.get("account:attempt")).toMatchObject({ departure: null, drafts: { q: expect.anything() } });
    expect(await recoverDeparture("account", "academy", "exam", null, journal)).toEqual({ ok: true });
    expect(api.departure).not.toHaveBeenCalled();
  });
  it("replays a breadcrumb with the journal exactly once and carries the warning into entry", async () => {
    const { journal, rows } = store(); rows.clear();
    const account = "12345678-1234-4123-8123-123456789012";
    const event = { eventId: account, questionId: null, generation: 2 };
    rows.set(`${account}:${account}`, { ...entry(), accountId: account, attemptId: account, examId: account, departure: event });
    writeBreadcrumb(account, account, account, event);
    api.departure.mockResolvedValue({ ok: true, kind: "warned", state: { attempt: { departureCount: 1 } } });
    expect(await recoverDeparture(account, "academy", account, "old-token", journal)).toEqual({ ok: true, warning: { event, count: 1 } });
    expect(api.departure).toHaveBeenCalledOnce(); expect(readBreadcrumbs(account, account)).toEqual([]);
    expect(rows.get(`${account}:${account}`)).toMatchObject({ departure: null, drafts: { q: expect.anything() } });
  });
  it("replays the synchronous breadcrumb even when IndexedDB never completed", async () => {
    const { journal } = store(); journal.keys = async () => { throw Error("unavailable"); };
    const id = "12345678-1234-4123-8123-123456789012";
    writeBreadcrumb(id, id, id, { eventId: id, questionId: null, generation: 1 });
    api.departure.mockResolvedValue({ ok: true, kind: "warned" });
    expect(await recoverDeparture(id, "academy", id, "token", journal)).toEqual({ ok: true });
    expect(api.departure).toHaveBeenCalledOnce(); expect(readBreadcrumbs(id, id)).toEqual([]);
  });

});
