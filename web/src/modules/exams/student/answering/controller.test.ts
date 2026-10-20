import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StudentExamAnswering, StudentExamAttemptState, StudentExamBrief, StudentExamSaveOutcome, StudentExamCommandResult } from "../types";
import { studentFailure } from "../errors";
import { AnsweringController, type AnsweringApi } from "./controller";
import { current } from "./drafts";
import { JOURNAL_SCHEMA, journalKey, readJournal, purgeJournals, type JournalStore } from "./journal";

export const attempt: StudentExamAttemptState = {
  id: "attempt", startedAt: "2026-10-20T00:00:00Z", deadlineAt: "2026-10-20T00:30:00Z", cutoffAt: "2026-10-20T00:30:00Z",
  departureCount: 0, answersVersion: 0, finalizedAt: null, finalizationReason: null, superseded: false,
};
function document(): StudentExamAnswering {
  return {
    accountId: "account", title: "Exam", instructions: "", serverNow: "2026-10-20T00:00:00Z", attempt: { ...attempt },
    editor: { generation: 1, expiresAt: "2026-10-20T00:00:45Z", heartbeatSeconds: 10, leaseSeconds: 45 },
    parts: [{ id: "part", kind: "written_work", title: "Part", instructions: "", questions: [1, 2, 3].map((n) => ({
      id: `q${n}`, number: n, kind: "written_work", partId: "part", prompt: `Question ${n}`, excluded: false, choices: [],
    })) }], answers: {}, departures: [], excludedQuestionIds: [],
  };
}
function memory() {
  const rows = new Map<string, unknown>();
  const store: JournalStore = {
    get: async (key) => structuredClone(rows.get(key)), put: async (key, value) => { rows.set(key, structuredClone(value)); },
    delete: async (key) => { rows.delete(key); }, keys: async () => [...rows.keys()],
  };
  return { store, rows };
}
const tick = async (ms = 0) => { await vi.advanceTimersByTimeAsync(ms); };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const sessions: AnsweringController[] = [];
function harness(store = memory().store) {
  const doc = document();
  const brief = (): StudentExamBrief => ({ serverNow: doc.serverNow, attempt: { ...doc.attempt }, excludedQuestionIds: doc.excludedQuestionIds });
  const terminal = () => ({ accountId: doc.accountId, serverNow: doc.serverNow, attempt: { ...doc.attempt, finalizedAt: doc.serverNow, finalizationReason: "submitted" as const }, submission: null });
  const api = {
    read: vi.fn(async () => ({ ok: true as const, kind: "state" as const, state: structuredClone(doc) })),
    heartbeat: vi.fn(async () => ({ ok: true as const, kind: "renewed" as const, expiresAt: doc.editor.expiresAt, state: brief() })),
    claim: vi.fn(async () => ({ ok: true as const, kind: "claimed" as const, ...doc.editor, token: "new-token" })),
    release: vi.fn(async () => ({ ok: true as const, kind: "released" as const })),
    save: vi.fn<AnsweringApi["save"]>(async (_token, version, answers) => {
      doc.attempt.answersVersion = version + 1;
      for (const answer of answers) doc.answers[answer.questionId] = "text" in answer ? { choiceId: null, text: answer.text } : { choiceId: answer.choiceId, text: null };
      return { ok: true, kind: "saved", answersVersion: version + 1, replayed: false, state: brief() };
    }),
    submit: vi.fn<AnsweringApi["submit"]>(async () => ({ ok: true, kind: "submitted", replayed: false, state: terminal() })),
    departure: vi.fn<AnsweringApi["departure"]>(async () => ({ ok: true, kind: "warned", departure: { eventId: "event", ordinal: 1, questionId: "q3", outcome: "warned", nextQuestionId: null }, state: brief() })),
  };
  let key = 0;
  const controller = new AnsweringController({ api, journal: store, examId: "exam", token: "token", generation: 1, heartbeatSeconds: 10,
    onToken: vi.fn(), uuid: () => `key-${++key}`, now: () => performance.now(), online: () => true,
    setTimer: setTimeout, clearTimer: clearTimeout });
  sessions.push(controller);
  return { controller, api, doc, brief, terminal, store };
}
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { for (const session of sessions.splice(0)) session.dispose(); vi.useRealTimers(); });

describe("durable answering queue", () => {
  it("preserves typing during an uncertain save and retries its exact key/body/version/generation", async () => {
    const h = harness(); await h.controller.start();
    const pending = deferred<StudentExamCommandResult<StudentExamSaveOutcome>>();
    h.api.save.mockImplementationOnce(() => pending.promise);
    h.controller.setAnswer("q1", { choiceId: null, text: "first" }); await tick(500);
    const original = structuredClone(h.api.save.mock.calls[0]);
    h.controller.setAnswer("q1", { choiceId: null, text: "second" });
    pending.resolve(studentFailure("unavailable")); await tick();
    expect(current(h.controller.getSnapshot().drafts, "q1").text).toBe("second");
    expect((await readJournal(h.store, "account", "attempt")).entry?.inflight?.answers).toEqual([{ questionId: "q1", text: "first" }]);
    await tick(1000);
    expect(h.api.save.mock.calls[1]).toEqual(original);
    expect(h.api.save.mock.calls[2][2]).toEqual([{ questionId: "q1", text: "second" }]);
    expect(h.controller.pendingCount()).toBe(0);
    expect(await h.store.keys()).toEqual([]);
  });

  it("recovers an unknown request after remount, without inventing a new command", async () => {
    const { store } = memory(); const first = harness(store); await first.controller.start();
    first.api.save.mockResolvedValue(studentFailure("unavailable"));
    first.controller.setAnswer("q1", { choiceId: null, text: "pending" }); await tick(500);
    const command = first.api.save.mock.calls[0]; first.controller.dispose();
    const next = harness(store); await next.controller.start(); await tick();
    expect(next.api.save.mock.calls[0]).toEqual(command);
    expect(await store.keys()).toEqual([]);
  });

  it("reconciles a rejected old generation before a fresh save, preserving a newer server answer", async () => {
    const h = harness(); await h.controller.start();
    h.api.save.mockResolvedValueOnce({ ok: true, kind: "editor_lost", reason: "replaced", acknowledgedVersion: null });
    h.doc.editor.generation = 2;
    h.doc.attempt.answersVersion = 1;
    h.doc.answers.q1 = { choiceId: null, text: "another device" };
    h.controller.setAnswer("q1", { choiceId: null, text: "offline local" }); await tick(500);
    expect(h.api.save).toHaveBeenCalledTimes(1);
    expect(h.controller.getSnapshot().drafts.conflicts.q1.text).toBe("another device");
    expect(current(h.controller.getSnapshot().drafts, "q1").text).toBe("offline local");
    h.controller.resolveConflict("q1", "mine"); await tick();
    expect(h.api.save.mock.calls[1][3]).not.toBe(h.api.save.mock.calls[0][3]);
    expect(h.api.save.mock.calls[1][4]).toBe(2);
  });

  it("does not mistake a late receipt for the current acknowledged answer", async () => {
    const h = harness(); await h.controller.start();
    h.doc.attempt.answersVersion = 2; h.doc.answers.q1 = { choiceId: null, text: "newer saved" };
    h.api.save.mockResolvedValueOnce({ ok: true, kind: "saved", answersVersion: 1, replayed: true, state: h.brief() });
    h.controller.setAnswer("q1", { choiceId: null, text: "old request" }); await tick(500);
    expect(current(h.controller.getSnapshot().drafts, "q1").text).toBe("newer saved");
    expect(h.api.read).toHaveBeenCalledTimes(2);
  });

  it("freezes confirmed answers and waits for save acknowledgment before submission", async () => {
    const h = harness(); await h.controller.start();
    h.api.save.mockResolvedValueOnce(studentFailure("throttled", 3));
    h.controller.setAnswer("q1", { choiceId: null, text: "final answer" }); h.controller.confirmSubmit(); await tick();
    h.controller.setAnswer("q1", { choiceId: null, text: "too late" });
    expect(h.api.submit).not.toHaveBeenCalled();
    expect((await readJournal(h.store, "account", "attempt")).entry?.submission).not.toBeNull();
    await tick(2999); expect(h.api.submit).not.toHaveBeenCalled(); await tick(1);
    expect(h.api.submit).toHaveBeenCalledWith("token", 1, expect.any(String), 1);
    expect(h.controller.getSnapshot().phase).toBe("finished");
    expect(h.controller.getSnapshot().questions).toEqual([]);
    expect(await h.store.keys()).toEqual([]);
  });

  it("ignores late save acknowledgments after authoritative finalization", async () => {
    const h = harness(); await h.controller.start();
    const pending = deferred<StudentExamCommandResult<StudentExamSaveOutcome>>(); h.api.save.mockImplementationOnce(() => pending.promise);
    h.controller.setAnswer("q1", { choiceId: null, text: "pending" }); await tick(500);
    h.api.heartbeat.mockResolvedValueOnce({ ok: true, kind: "finalized", state: h.terminal() } as never);
    h.controller.resync(); await tick();
    pending.resolve({ ok: true, kind: "saved", answersVersion: 1, replayed: false, state: h.brief() }); await tick();
    expect(h.controller.getSnapshot().phase).toBe("finished");
    expect(h.controller.getSnapshot().questions).toEqual([]);
    expect(h.controller.getSnapshot().drafts.saved).toEqual({});
  });

  it("advances deterministically on exclusion and shows the end state after departure from the last question", async () => {
    const h = harness(); await h.controller.start(); h.controller.goTo("q2");
    h.doc.excludedQuestionIds = ["q2"]; h.controller.resync(); await tick();
    expect(h.controller.getSnapshot().currentId).toBe("q3");
    void h.controller.recordDeparture("event"); await tick();
    expect(h.controller.getSnapshot().currentId).toBeNull();
    expect(h.api.submit).not.toHaveBeenCalled();
  });

  it("retains the last displayed question after end navigation without wrapping", async () => {
    const h = harness(); await h.controller.start(); h.controller.goTo("q3");
    await h.controller.recordDeparture("first");
    expect(h.controller.getSnapshot().currentId).toBeNull();
    await h.controller.recordDeparture("second");
    expect(h.api.departure.mock.calls[1]).toEqual(["token", "second", "q3", 1]);
    expect(h.controller.getSnapshot().currentId).toBeNull();
  });

  it("captures context-free departure during initial loading and delivers after material loads", async () => {
    const h = harness();
    const pending = h.controller.recordDeparture("loading-event");
    expect(h.api.departure).not.toHaveBeenCalled();
    await h.controller.start(); await tick(); await pending;
    expect(h.api.departure.mock.calls[0]).toEqual(["token", "loading-event", null, 1]);
  });

  it("blocks navigation, conflict resolution and confirmation as well as answers", async () => {
    const h = harness(); await h.controller.start(); h.controller.setEditBlock("Return to fullscreen");
    h.controller.goTo("q3"); h.controller.step(1); h.controller.confirmSubmit();
    h.controller.resolveConflict("q1", "mine"); h.controller.setAnswer("q1", { choiceId: null, text: "blocked" });
    expect(h.controller.getSnapshot().currentId).toBe("q1");
    expect(h.controller.getSnapshot().phase).toBe("ready");
    expect(h.api.submit).not.toHaveBeenCalled(); expect(h.controller.pendingCount()).toBe(0);
  });

  it("keeps editing in memory when storage fails without promising recovery", async () => {
    const { store } = memory(); store.put = async () => { throw new Error("quota"); };
    const h = harness(store); await h.controller.start();
    h.controller.setAnswer("q1", { choiceId: null, text: "retained" }); await tick();
    expect(h.controller.getSnapshot().journal).toBe("unavailable");
    expect(h.controller.getSnapshot().stored).toBe(false);
    expect(current(h.controller.getSnapshot().drafts, "q1").text).toBe("retained");
  });

  it("delivers a departure while an answer save is still awaiting acknowledgment", async () => {
    const h = harness(); await h.controller.start();
    const pending = deferred<StudentExamCommandResult<StudentExamSaveOutcome>>(); h.api.save.mockImplementationOnce(() => pending.promise);
    h.controller.setAnswer("q1", { choiceId: null, text: "pending" }); await tick(500);
    void h.controller.recordDeparture("event"); await tick();
    expect(h.api.departure).toHaveBeenCalledOnce();
    expect(h.controller.getSnapshot().pendingDeparture).toBe(false);
    pending.resolve(studentFailure("unavailable")); await tick();
  });

  it("freezes on apparent expiry and waits for authoritative finalization", async () => {
    const h = harness(); h.doc.attempt.cutoffAt = "2026-10-20T00:00:01Z";
    await h.controller.start(); await tick(1100);
    expect(h.controller.getSnapshot().phase).toBe("expired");
    h.controller.setAnswer("q1", { choiceId: null, text: "late" });
    expect(h.controller.pendingCount()).toBe(0);
    expect(h.controller.getSnapshot().questions).not.toHaveLength(0);
    h.api.heartbeat.mockResolvedValueOnce({ ok: true, kind: "finalized", state: h.terminal() } as never);
    h.controller.resync(); await tick();
    expect(h.controller.getSnapshot().phase).toBe("finished");
  });

  it("never sends or persists more work after sign-out", async () => {
    const h = harness(); await h.controller.start();
    h.controller.setAnswer("q1", { choiceId: null, text: "pending" }); h.controller.signedOut();
    await purgeJournals(h.store, null); await tick(5000);
    expect(h.api.save).not.toHaveBeenCalled(); expect(await h.store.keys()).toEqual([]);
    expect(h.controller.getSnapshot().questions).toEqual([]);
  });
});

describe("account journal", () => {
  it("upgrades v2 departure journals without discarding pending answers", async () => {
    const { store, rows } = memory();
    rows.set("account:attempt", { schema: 2, accountId: "account", attemptId: "attempt", examId: "exam", seq: 1,
      drafts: { q1: { value: { choiceId: null, text: "pending" }, baseline: { choiceId: null, text: null }, seq: 1 } },
      inflight: null, submission: { key: null, expectedVersion: null, generation: 1 },
      departure: { eventId: "event", questionId: "q1", generation: 1 }, updatedAt: 0 });
    const recovered = await readJournal(store, "account", "attempt");
    expect(recovered.discarded).toBe(false); expect(recovered.entry?.schema).toBe(JOURNAL_SCHEMA);
    expect(recovered.entry?.drafts.q1.value.text).toBe("pending"); expect(recovered.entry?.submission?.generation).toBe(1);
  });
  it("purges other accounts and rejects malformed or older-schema entries", async () => {
    const { store, rows } = memory();
    rows.set(journalKey("other", "attempt"), {});
    rows.set(journalKey("account", "attempt"), { schema: JOURNAL_SCHEMA, accountId: "account", attemptId: "attempt", drafts: {}, seq: 1 });
    await purgeJournals(store, "account"); expect(await store.keys()).toEqual(["account:attempt"]);
    expect(await readJournal(store, "account", "attempt")).toEqual({ entry: null, discarded: true });
    rows.set("account:attempt", { schema: 0 });
    expect((await readJournal(store, "account", "attempt")).discarded).toBe(true);
  });
});
