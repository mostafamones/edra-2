import { newUuid } from "@/lib/uuid";
import { onExamAccountChange } from "../answering/cleanup";
import type { ExamAnsweringLifecycle } from "../integration";
import { examFullscreen } from "../fullscreen";
import { clearBreadcrumb, writeBreadcrumb } from "./breadcrumb";
import { DepartureEpisodes, type DepartureContext } from "./state";

/** Created synchronously on entry acknowledgment, before answering material is requested. */
export class ExamDepartureMonitor {
  private episodes = new DepartureEpisodes();
  private lifecycle: ExamAnsweringLifecycle | null = null;
  private delivering: string | null = null;
  private unsubscribe: (() => void) | null = null;
  private listeners = new Set<() => void>();
  private count = 0;
  private remove: (() => void) | null = null;
  private message: string | null = null;
  private snapshot = { blocked: false, pending: false, count: 0, message: null as string | null };
  constructor(private scope: { accountId: string; academyId: string; examId: string; attemptId: string; token: string; generation: number }) {}
  getSnapshot = () => this.snapshot;
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  private emit() {
    this.snapshot = { blocked: !!this.episodes.episode, pending: !!this.episodes.episode && !this.episodes.episode.acknowledged, count: this.count, message: this.message };
    for (const fn of this.listeners) fn();
  }
  signal = () => {
    if (this.lifecycle?.getState().finished) { this.finish(); return; }
    const event = this.episodes.signal(() => this.lifecycle?.departureContext() ?? {
      eventId: newUuid(), questionId: null, generation: this.scope.generation,
    });
    if (!event) return;
    writeBreadcrumb(this.scope.accountId, this.scope.attemptId, this.scope.examId, event);
    this.lifecycle?.setEditBlock("Departure pending");
    this.emit();
    this.deliver(event);
  };
  private deliver(event: DepartureContext) {
    if (!this.lifecycle || this.delivering === event.eventId) return;
    this.delivering = event.eventId;
    void this.lifecycle.recordDeparture(event.eventId, event).then((outcome) => {
      if (this.episodes.finished || !outcome) return;
      if (outcome.kind === "kicked" || outcome.kind === "finalized") { this.finish(); return; }
      if (outcome.kind === "editor_lost") {
        this.message = "A pending departure could not be authorized.";
        this.count = this.lifecycle?.getState().departureCount ?? this.count;
        this.episodes.acknowledge(event.eventId);
        clearBreadcrumb(this.scope.accountId, this.scope.attemptId, event.eventId);
      } else {
        this.count = outcome.state.attempt.departureCount;
        this.episodes.acknowledge(event.eventId);
        this.lifecycle?.setEditBlock("Continue to resume the exam");
        clearBreadcrumb(this.scope.accountId, this.scope.attemptId, event.eventId);
      }
      this.emit();
    });
  }
  attach(lifecycle: ExamAnsweringLifecycle | null) {
    this.unsubscribe?.();
    this.lifecycle = lifecycle;
    if (!lifecycle) return;
    const update = () => { if (lifecycle.getState().finished) this.finish(); };
    this.unsubscribe = lifecycle.subscribe(update);
    if (this.episodes.episode) {
      lifecycle.setEditBlock(this.episodes.episode.acknowledged ? "Continue to resume the exam" : "Departure pending");
      this.deliver(this.episodes.episode.event);
    }
    update();
  }
  restore(event: DepartureContext, count: number) {
    this.episodes.signal(() => event);
    this.episodes.acknowledge(event.eventId);
    this.delivering = event.eventId;
    this.count = count;
    this.emit();
  }
  start() {
    if (this.remove || this.episodes.finished) return;
    const changed = () => { if (document.visibilityState === "hidden" || !examFullscreen()) this.signal(); };
    const hide = () => {
      this.signal();
      const event = this.episodes.episode?.event;
      if (!event) return;
      const token = this.lifecycle?.currentToken() ?? this.scope.token;
      // Enqueue is not an acknowledgment. Keep the breadcrumb until exact authoritative replay.
      void fetch(`/api/student/exams/${this.scope.examId}/departure`, { method: "POST", credentials: "same-origin", keepalive: true,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ academyId: this.scope.academyId, token, ...event }) }).catch(() => {});
    };
    const navigate = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
        || !anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, location.href);
      if (url.origin !== location.origin || url.pathname !== location.pathname || url.search !== location.search) hide();
    };
    window.addEventListener("popstate", hide);
    document.addEventListener("click", navigate);
    document.addEventListener("visibilitychange", changed);
    document.addEventListener("fullscreenchange", changed);
    window.addEventListener("pagehide", hide);
    const accountStop = onExamAccountChange(() => this.finish());
    this.remove = () => {
      accountStop();
      window.removeEventListener("popstate", hide);
      document.removeEventListener("click", navigate);
      document.removeEventListener("visibilitychange", changed);
      document.removeEventListener("fullscreenchange", changed);
      window.removeEventListener("pagehide", hide);
    };
    changed();
  }
  continue() {
    if (!this.episodes.continue(document.visibilityState === "visible" && examFullscreen())) return;
    this.delivering = null;
    this.message = null;
    this.lifecycle?.setEditBlock(null);
    this.emit();
  }
  stop() { this.remove?.(); this.remove = null; this.unsubscribe?.(); this.unsubscribe = null; }
  finish() {
    this.episodes.finish();
    clearBreadcrumb(this.scope.accountId, this.scope.attemptId);
    this.stop(); this.emit();
  }
}
