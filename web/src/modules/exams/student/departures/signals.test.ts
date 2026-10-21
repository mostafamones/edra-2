// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExamAnsweringLifecycle } from "../integration";
import type { StudentExamDepartureOutcome } from "../types";
import { readBreadcrumbs } from "./breadcrumb";
import { ExamDepartureMonitor } from "./signals";
const id = "12345678-1234-4123-8123-123456789012";
const visible = (state: "hidden" | "visible") => Object.defineProperty(document, "visibilityState", { configurable: true, value: state });
const full = (value: boolean) => Object.defineProperty(document, "fullscreenElement", { configurable: true, value: value ? document.documentElement : null });
const monitors: ExamDepartureMonitor[] = [];
function harness() {
  let seq = 0; let finished = false;
  let acknowledge!: (value: StudentExamDepartureOutcome) => void;
  const departure = vi.fn<ExamAnsweringLifecycle["recordDeparture"]>(() => new Promise<StudentExamDepartureOutcome>((resolve) => { acknowledge = resolve; }));
  const lifecycle: ExamAnsweringLifecycle = {
    attemptId: id, currentQuestionId: () => id, currentToken: () => "a".repeat(64),
    departureContext: () => ({ eventId: `12345678-1234-4123-8123-${String(++seq).padStart(12, "0")}`, questionId: id, generation: 2 }),
    recordDeparture: departure, setEditBlock: vi.fn(), getState: () => ({ finished, pendingDeparture: false, departureCount: 0, editBlock: null }),
    subscribe: () => () => {},
  };
  const monitor = new ExamDepartureMonitor({ accountId: id, attemptId: id, examId: id, academyId: id, token: "a".repeat(64), generation: 2 });
  monitors.push(monitor); monitor.start();
  return { monitor, lifecycle, departure, end: () => { finished = true; }, acknowledge: async () => {
    acknowledge({ kind: "warned", departure: null, state: { attempt: { departureCount: 1 } } } as StudentExamDepartureOutcome);
    await Promise.resolve();
  } };
}
beforeEach(() => { localStorage.clear(); visible("visible"); full(true); vi.stubGlobal("fetch", vi.fn(async () => new Response())); });
afterEach(() => { for (const monitor of monitors.splice(0)) monitor.stop(); vi.unstubAllGlobals(); });
describe("browser signal integration", () => {
  it("ignores visible focus, network events, lifecycle reattachment and cleanup", () => {
    const h = harness(); h.monitor.attach(h.lifecycle); h.monitor.attach(null); h.monitor.attach(h.lifecycle);
    for (const type of ["blur", "focus", "offline", "online", "pageshow"]) window.dispatchEvent(new Event(type));
    h.monitor.stop(); expect(h.departure).not.toHaveBeenCalled(); expect(readBreadcrumbs(id, id)).toEqual([]);
  });
  it("writes a synchronous breadcrumb before loading/IndexedDB and uses the same event for pagehide", async () => {
    const h = harness(); visible("hidden"); document.dispatchEvent(new Event("visibilitychange"));
    const [crumb] = readBreadcrumbs(id, id); expect(crumb.questionId).toBeNull(); expect(crumb.generation).toBe(2);
    expect(h.departure).not.toHaveBeenCalled();
    full(false); document.dispatchEvent(new Event("fullscreenchange")); window.dispatchEvent(new Event("pagehide"));
    expect(readBreadcrumbs(id, id)).toEqual([crumb]);
    const sent = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(sent.eventId).toBe(crumb.eventId); expect(sent.questionId).toBeNull();
    expect(vi.mocked(fetch).mock.calls[0][1]!.keepalive).toBe(true);
    h.monitor.attach(h.lifecycle); expect(h.departure).toHaveBeenCalledOnce();
    expect(h.departure.mock.calls[0]).toEqual([crumb.eventId, { eventId: crumb.eventId, questionId: null, generation: 2 }]);
    await h.acknowledge(); expect(readBreadcrumbs(id, id)).toEqual([]);
    h.monitor.continue(); expect(h.monitor.getSnapshot().blocked).toBe(true);
    visible("visible"); full(true); h.monitor.continue(); expect(h.monitor.getSnapshot().blocked).toBe(false);
    visible("hidden"); document.dispatchEvent(new Event("visibilitychange"));
    expect(h.departure).toHaveBeenCalledTimes(2);
    expect(h.departure.mock.calls[1][0]).not.toBe(crumb.eventId);
  });
  it("does not count after terminal disarm or an already finished callback", () => {
    const h = harness(); h.monitor.attach(h.lifecycle); h.end();
    full(false); document.dispatchEvent(new Event("fullscreenchange"));
    window.dispatchEvent(new Event("pagehide")); expect(h.departure).not.toHaveBeenCalled();
    expect(readBreadcrumbs(id, id)).toEqual([]);
  });
});
