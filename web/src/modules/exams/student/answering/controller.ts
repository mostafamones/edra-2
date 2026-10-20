import type {
  StudentExamAnswerPatch, StudentExamAnswering, StudentExamAttemptState, StudentExamBrief, StudentExamClaimOutcome,
  StudentExamCommandResult, StudentExamDepartureOutcome, StudentExamFailure, StudentExamHeartbeatOutcome, StudentExamQuestion,
  StudentExamReadOutcome, StudentExamReleaseOutcome, StudentExamSaveOutcome, StudentExamSubmitOutcome, StudentExamTerminal,
} from "../types";
import {
  acknowledge, createDrafts, drop, edit, nextCommand, pendingCount, reconcile, reject, resolve, type Answer, type Drafts,
} from "./drafts";
import { journalKey, readJournal, JOURNAL_SCHEMA, purgeJournals, type JournalEntry, type JournalStore } from "./journal";

/**
 * One active answering session for an acknowledged attempt and editor claim. It owns the save
 * queue, recovery journal, heartbeat, deadline display and submission; React renders snapshots.
 *
 * Rules it keeps:
 * - One command in flight. Retries of an uncertain outcome resend the same key, version and body,
 *   respecting backoff and retryAfter. Only server acknowledgments make answers "saved".
 * - Ownership: every command carries the claim token. A lost lease is reclaimed only when no other
 *   live editor exists; otherwise the session blocks without a takeover and keeps polling.
 * - Time: the cutoff and server time come from the server; a monotonic clock interpolates between
 *   responses. Reaching the cutoff freezes editing until the server reports the outcome.
 * - Finalization (any reason) is terminal: pending local data is removed and nothing reopens.
 */

export type AnsweringApi = {
  read(token: string): Promise<StudentExamCommandResult<StudentExamReadOutcome>>;
  heartbeat(token: string): Promise<StudentExamCommandResult<StudentExamHeartbeatOutcome>>;
  claim(token: string | null): Promise<StudentExamCommandResult<StudentExamClaimOutcome>>;
  release(token: string): Promise<StudentExamCommandResult<StudentExamReleaseOutcome>>;
  save(token: string, expectedVersion: number, answers: StudentExamAnswerPatch[], key: string, generation: number): Promise<StudentExamCommandResult<StudentExamSaveOutcome>>;
  submit(token: string, expectedVersion: number, key: string, generation: number): Promise<StudentExamCommandResult<StudentExamSubmitOutcome>>;
  departure(token: string, eventId: string, questionId: string, generation: number): Promise<StudentExamCommandResult<StudentExamDepartureOutcome>>;
};

type Handle = ReturnType<typeof setTimeout>;

export type AnsweringDeps = {
  api: AnsweringApi;
  /** Null when browser storage is unavailable: answers still save, but a refresh cannot recover pending ones. */
  journal: JournalStore | null;
  examId: string;
  token: string;
  heartbeatSeconds: number;
  generation: number;
  /** Called with each newly claimed token (stored for same-tab refresh recovery). */
  onToken: (token: string) => void;
  uuid: () => string;
  /** Monotonic milliseconds. */
  now: () => number;
  setTimer: (run: () => void, ms: number) => Handle;
  clearTimer: (handle: Handle) => void;
  online: () => boolean;
};

export type AnsweringPhase = "loading" | "ready" | "submitting" | "expired" | "blocked" | "finished";
export type BlockReason = "busy" | "signed_out" | "not_eligible" | "error";

export type AnsweringSnapshot = {
  phase: AnsweringPhase;
  block: { reason: BlockReason; message: string } | null;
  title: string;
  instructions: string;
  /** Every question in exam order, excluded ones included (they keep their numbers). */
  questions: StudentExamQuestion[];
  partInstructions: Record<string, { title: string; instructions: string }>;
  excluded: ReadonlySet<string>;
  attempt: StudentExamAttemptState | null;
  drafts: Drafts;
  currentId: string | null;
  network: "online" | "offline";
  /** A save request is on its way. */
  saving: boolean;
  /** Pending answers are written to this browser. */
  stored: boolean;
  journal: "ok" | "unavailable";
  submitStage: "saving" | "sending" | "waiting" | null;
  notice: string | null;
  editBlock: string | null;
  terminal: StudentExamTerminal | null;
  pendingDeparture: boolean;
};

const BACKOFF = [1000, 2000, 4000, 8000, 15000];
const TEXT_DEBOUNCE = 500;
const BUSY_POLL = 10_000;
const EXPIRED_POLL = 3000;

const BLOCKING: Partial<Record<StudentExamFailure["code"], BlockReason>> = {
  forbidden: "signed_out",
  not_eligible: "not_eligible",
  not_open: "error",
  not_found: "error",
  validation: "error",
  year_unavailable: "error",
  content_unavailable: "error",
  student_link_unavailable: "error",
  source_conflict: "error",
};

type Clock = { cutoff: number; server: number; mono: number };
type Waiter = (outcome: StudentExamDepartureOutcome | null) => void;

export class AnsweringController {
  private deps: AnsweringDeps;
  private state: AnsweringSnapshot;
  private listeners = new Set<() => void>();
  private token: string;
  private generation: number;
  private accountId: string | null = null;
  private submission: JournalEntry["submission"] = null;
  private departure: JournalEntry["departure"] = null;
  private delivering: Promise<boolean> | null = null;
  private departureWaiters = new Map<string, Waiter[]>();
  private clock: Clock | null = null;
  private timers = new Map<string, Handle>();
  private failures = 0;
  private knownRejections = 0;
  private pumping = false;
  private pumpAgain = false;
  private reclaiming: Promise<boolean> | null = null;
  private writes: Promise<void> = Promise.resolve();
  private writeQueued = false;
  private disposed = false;

  constructor(deps: AnsweringDeps) {
    this.deps = deps;
    this.token = deps.token;
    this.generation = deps.generation;
    this.state = {
      phase: "loading", block: null, title: "", instructions: "", questions: [], partInstructions: {}, excluded: new Set(),
      attempt: null, drafts: createDrafts({}, 0), currentId: null, network: deps.online() ? "online" : "offline", saving: false,
      stored: true, journal: deps.journal ? "ok" : "unavailable", submitStage: null, notice: null, editBlock: null, terminal: null,
      pendingDeparture: false,
    };
  }

  // -------------------------------------------------------------------------------------------
  // Store.

  getSnapshot = () => this.state;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private set(patch: Partial<AnsweringSnapshot>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  /** Milliseconds left by the server clock, or null before the first server response. */
  remaining(): number | null {
    if (!this.clock) return null;
    return this.clock.cutoff - (this.clock.server + (this.deps.now() - this.clock.mono));
  }

  get attemptId() {
    return this.state.attempt?.id ?? null;
  }

  /** The current claim token (it changes when the lease is reclaimed). */
  canReadImages() {
    return !this.disposed && (this.state.phase === "ready" || this.state.phase === "submitting");
  }

  currentToken() {
    return this.token;
  }

  // -------------------------------------------------------------------------------------------
  // Lifecycle.

  async start() {
    const result = await this.deps.api.read(this.token);
    if (this.ended()) return;
    if (!result.ok) {
      if (this.retryable(result)) { this.retryLater("start", () => void this.start(), result); return; }
      this.failWith(result);
      return;
    }
    this.failures = 0;
    if (result.kind === "finalized") { await this.finish(result.state); return; }
    if (result.kind === "editor_lost") {
      if (await this.reclaim()) void this.start();
      return;
    }
    await this.load(result.state);
  }

  private async load(doc: StudentExamAnswering) {
    this.accountId = doc.accountId;
    const questions = doc.parts.flatMap((part) => part.questions);
    const excluded = new Set([...doc.excludedQuestionIds, ...questions.filter((question) => question.excluded).map((question) => question.id)]);
    let drafts = createDrafts(doc.answers, doc.attempt.answersVersion);
    let journal = this.state.journal;
    let notice: string | null = null;
    if (this.deps.journal) {
      try {
        await purgeJournals(this.deps.journal, doc.accountId);
        const { entry, discarded } = await readJournal(this.deps.journal, doc.accountId, doc.attempt.id);
        if (discarded) notice = "Some answers saved on this device couldn’t be recovered.";
        if (entry) {
          drafts = { ...drafts, drafts: entry.drafts, seq: entry.seq, inflight: entry.inflight };
          this.submission = entry.submission;
          this.departure = entry.departure;
        }
      } catch {
        journal = "unavailable";
      }
    }
    // Without an uncertain command, recovered drafts are checked against the acknowledged answers now.
    if (!drafts.inflight) drafts = reconcile(drafts, doc.answers, doc.attempt.answersVersion);
    drafts = drop(drafts, excluded);
    this.observe(doc.serverNow, doc.attempt);
    const partInstructions = Object.fromEntries(doc.parts.map((part) => [part.id, { title: part.title, instructions: part.instructions }]));
    const latestDeparture = [...doc.departures].sort((a, b) => b.ordinal - a.ordinal)[0];
    const eligible = questions.filter((question) => !excluded.has(question.id));
    let first: string | null = eligible[0]?.id ?? null;
    if (latestDeparture?.outcome === "warned") {
      if (latestDeparture.nextQuestionId === null) first = null;
      else if (eligible.some((question) => question.id === latestDeparture.nextQuestionId)) first = latestDeparture.nextQuestionId;
      else {
        const position = questions.findIndex((question) => question.id === latestDeparture.nextQuestionId);
        first = questions.slice(position + 1).find((question) => !excluded.has(question.id))?.id
          ?? questions.slice(0, position).reverse().find((question) => !excluded.has(question.id))?.id ?? null;
      }
    }
    if (this.ended()) return;
    this.set({
      phase: this.submission ? "submitting" : "ready", submitStage: this.submission ? "saving" : null,
      title: doc.title, instructions: doc.instructions, questions, partInstructions, excluded, attempt: doc.attempt, drafts,
      currentId: this.state.currentId && !excluded.has(this.state.currentId) ? this.state.currentId : first,
      journal, notice, pendingDeparture: this.departure !== null,
    });
    await this.persist();
    this.scheduleHeartbeat();
    this.scheduleDeadline();
    void this.pump();
  }

  /** Leaving without finishing: end the lease so this tab or another can claim again at once. */
  async leave() {
    if (this.state.phase === "finished" || this.state.block?.reason === "busy") return;
    try { await this.deps.api.release(this.token); } catch { /* Best effort: the lease expires anyway. */ }
  }

  signedOut() {
    this.set({ phase: "blocked", questions: [], drafts: createDrafts({}, 0), block: { reason: "signed_out", message: "Sign in again to continue." } });
    this.dispose();
  }

  dispose() {
    this.disposed = true;
    for (const handle of this.timers.values()) this.deps.clearTimer(handle);
    this.timers.clear();
    this.listeners.clear();
  }

  /** The page became visible again or the connection came back: check in with the server now. */
  resync() {
    if (this.ended()) return;
    this.set({ network: this.deps.online() ? "online" : "offline" });
    this.clearTimer("retry");
    this.failures = 0;
    void this.heartbeat();
    void this.pump();
  }

  private timer(name: string, run: () => void, ms: number) {
    this.clearTimer(name);
    if (this.ended()) return;
    this.timers.set(name, this.deps.setTimer(() => { this.timers.delete(name); if (!this.disposed) run(); }, Math.max(0, ms)));
  }

  private clearTimer(name: string) {
    const handle = this.timers.get(name);
    if (handle !== undefined) this.deps.clearTimer(handle);
    this.timers.delete(name);
  }

  // -------------------------------------------------------------------------------------------
  // Answers and navigation.

  answerable(questionId: string) {
    return this.state.questions.some((question) => question.id === questionId) && !this.state.excluded.has(questionId);
  }

  get editable() {
    return this.state.phase === "ready" && this.state.editBlock === null;
  }

  setAnswer(questionId: string, value: Answer) {
    if (!this.editable || !this.answerable(questionId)) return;
    const question = this.state.questions.find((entry) => entry.id === questionId);
    this.set({ drafts: edit(this.state.drafts, questionId, value), stored: false, notice: null });
    void this.persist();
    // Choices save promptly; typing waits for a pause.
    this.timer("flush", () => void this.pump(), question?.kind === "written_work" ? TEXT_DEBOUNCE : 0);
  }

  resolveConflict(questionId: string, choice: "mine" | "saved") {
    if (this.state.phase !== "ready") return;
    this.set({ drafts: resolve(this.state.drafts, questionId, choice) });
    void this.persist();
    void this.pump();
  }

  private navigable() {
    return this.state.questions.filter((question) => !this.state.excluded.has(question.id));
  }

  goTo(questionId: string) {
    if (!this.answerable(questionId)) return;
    this.set({ currentId: questionId });
    // Navigation flushes pending text without waiting for the network.
    this.clearTimer("flush");
    void this.pump();
  }

  step(delta: 1 | -1) {
    const list = this.navigable();
    const index = list.findIndex((question) => question.id === this.state.currentId);
    const target = list[index + delta];
    if (target) this.goTo(target.id);
  }

  setEditBlock(reason: string | null) {
    this.set({ editBlock: reason });
  }

  // -------------------------------------------------------------------------------------------
  // Server state.

  private observe(serverNow: string, attempt: StudentExamAttemptState) {
    const server = Date.parse(serverNow);
    const cutoff = Date.parse(attempt.cutoffAt);
    if (Number.isFinite(server) && Number.isFinite(cutoff)) {
      // A reordered acknowledgment cannot move the clock or original cutoff backwards.
      if (this.clock && server <= this.clock.server) return;
      this.clock = { cutoff: Math.min(this.clock?.cutoff ?? cutoff, cutoff), server, mono: this.deps.now() };
    }
  }

  private applyBrief(brief: StudentExamBrief) {
    this.observe(brief.serverNow, brief.attempt);
    const excluded = new Set([...this.state.excluded, ...brief.excludedQuestionIds]);
    const added = brief.excludedQuestionIds.filter((id) => !this.state.excluded.has(id));
    const patch: Partial<AnsweringSnapshot> = { attempt: brief.attempt };
    if (added.length > 0) {
      patch.excluded = excluded;
      patch.drafts = drop(this.state.drafts, added);
      if (this.state.currentId && excluded.has(this.state.currentId)) patch.currentId = this.replacementFor(this.state.currentId, excluded);
    }
    this.set(patch);
    this.scheduleDeadline();
  }

  /** The next answerable question after an excluded one, else the previous one. */
  private replacementFor(questionId: string, excluded: ReadonlySet<string>) {
    const index = this.state.questions.findIndex((question) => question.id === questionId);
    const after = this.state.questions.slice(index + 1).find((question) => !excluded.has(question.id));
    const before = this.state.questions.slice(0, index).reverse().find((question) => !excluded.has(question.id));
    return after?.id ?? before?.id ?? null;
  }

  /** A full read: fresh exclusions and acknowledged answers, reconciled against pending drafts. */
  private async refresh(): Promise<boolean> {
    const result = await this.deps.api.read(this.token);
    if (this.ended()) return false;
    if (!result.ok) { this.handleFailure(result, () => void this.pump()); return false; }
    if (result.kind === "finalized") { await this.finish(result.state); return false; }
    if (result.kind === "editor_lost") return (await this.reclaim()) && this.refresh();
    const doc = result.state;
    this.applyBrief({ serverNow: doc.serverNow, attempt: doc.attempt, excludedQuestionIds: doc.excludedQuestionIds });
    let drafts = this.state.drafts;
    if (!drafts.inflight) drafts = reconcile(drafts, doc.answers, doc.attempt.answersVersion);
    this.set({ drafts: drop(drafts, this.state.excluded) });
    await this.persist();
    return true;
  }

  private scheduleHeartbeat() {
    this.timer("heartbeat", () => void this.heartbeat(), this.deps.heartbeatSeconds * 1000);
  }

  private async heartbeat() {
    if (this.disposed || this.state.phase === "finished" || this.state.phase === "loading") return;
    if (this.state.phase === "blocked" && this.state.block?.reason !== "busy") return;
    this.scheduleHeartbeat();
    if (this.state.phase === "blocked") return;
    const result = await this.deps.api.heartbeat(this.token);
    if (this.ended()) return;
    if (!result.ok) {
      if (this.retryable(result)) this.set({ network: "offline" });
      else this.failWith(result);
      return;
    }
    this.set({ network: "online" });
    if (result.kind === "finalized") { await this.finish(result.state); return; }
    if (result.kind === "editor_lost") {
      if (await this.reclaim()) void this.pump();
      return;
    }
    this.applyBrief(result.state);
    if (this.state.phase === "expired") this.leaveExpired();
  }

  private scheduleDeadline() {
    const remaining = this.remaining();
    if (remaining === null || this.state.phase === "finished") return;
    if (remaining <= 0) { if (this.state.phase !== "expired") this.expire(); return; }
    this.timer("deadline", () => this.expire(), remaining + 50);
  }

  /** The server clock says time is up: freeze editing and let the server settle the attempt. */
  private expire() {
    const remaining = this.remaining();
    if (remaining !== null && remaining > 0) { this.scheduleDeadline(); return; }
    if (this.state.phase === "finished" || this.state.phase === "blocked") return;
    this.clearTimer("flush");
    if (this.state.phase !== "expired") this.set({ phase: "expired" });
    void this.heartbeat();
    this.timer("expired", () => this.expire(), EXPIRED_POLL);
  }

  private leaveExpired() {
    const remaining = this.remaining();
    if (remaining !== null && remaining > 0) {
      this.clearTimer("expired");
      this.set({ phase: this.submission ? "submitting" : "ready" });
      this.scheduleDeadline();
      void this.pump();
    }
  }

  // -------------------------------------------------------------------------------------------
  // Ownership.

  /** Claims again with the current token: a fresh generation if no live editor exists, busy otherwise. */
  private reclaim(): Promise<boolean> {
    if (this.reclaiming) return this.reclaiming;
    this.reclaiming = (async () => {
      const result = await this.deps.api.claim(this.token);
      if (this.ended()) return false;
      if (!result.ok) {
        if (this.retryable(result)) this.retryLater("reclaim", () => void this.reclaim().then((ok) => { if (ok) { if (!this.state.attempt) void this.start(); else void this.resume(); } }), result);
        else this.failWith(result);
        return false;
      }
      if (result.kind === "finalized") { await this.finish(result.state); return false; }
      if (result.kind === "busy") {
        this.set({ phase: "blocked", block: { reason: "busy", message: "This exam is open in another tab or device." } });
        this.timer("reclaim", () => void this.reclaim().then((ok) => { if (ok) void this.resume(); }), Math.max(BUSY_POLL, result.retryAfter * 1000));
        return false;
      }
      this.token = result.token;
      this.generation = result.generation;
      this.deps.onToken(result.token);
      return true;
    })().finally(() => { this.reclaiming = null; });
    return this.reclaiming;
  }

  /** Back from a busy block: reconcile with whatever the other editor saved, then continue. */
  private async resume() {
    if (this.state.phase !== "blocked") return;
    if (!this.state.attempt) {
      this.set({ phase: "loading", block: null });
      void this.start();
      return;
    }
    this.set({ phase: this.submission ? "submitting" : "ready", block: null });
    await this.refresh();
    this.scheduleHeartbeat();
    this.scheduleDeadline();
    void this.pump();
  }

  // -------------------------------------------------------------------------------------------
  // The queue: departure delivery, then saves, then the final submission.

  private async pump(): Promise<void> {
    if (this.pumping) { this.pumpAgain = true; return; }
    this.pumping = true;
    try {
      while (!this.disposed && this.active() && !this.timers.has("retry") && !this.reclaiming) {
        if (this.departure) { if (!(await this.deliverPendingDeparture())) break; continue; }
        if (this.state.phase === "expired") break;
        if (this.state.drafts.inflight) { if (!(await this.sendSave())) break; continue; }
        const key = this.deps.uuid();
        const next = nextCommand(this.state.drafts, this.state.questions, (id) => this.answerable(id), key, this.generation);
        if (next) {
          // The command is stored before it is sent, so a refresh retries it unchanged.
          this.set({ drafts: next.model });
          await this.persist();
          continue;
        }
        if (this.state.phase === "submitting") await this.sendSubmit();
        break;
      }
    } finally {
      this.pumping = false;
      if (this.pumpAgain) { this.pumpAgain = false; void this.pump(); }
    }
  }

  private ended() { return this.disposed || this.state.phase === "finished"; }

  private active() {
    return this.state.phase === "ready" || this.state.phase === "submitting" || this.state.phase === "expired";
  }

  private async sendSave(): Promise<boolean> {
    const command = this.state.drafts.inflight!;
    this.set({ saving: true });
    const result = await this.deps.api.save(this.token, command.expectedVersion, command.answers, command.key, command.generation);
    if (this.ended()) return false;
    this.set({ saving: false });
    if (!result.ok) {
      if (result.code === "question_excluded" || result.code === "unknown_question" || result.code === "idempotency_conflict") {
        // Definitively not accepted: reload the exam's current shape and answers, then rebuild.
        this.set({ drafts: reject(this.state.drafts), notice: result.message });
        if (++this.knownRejections > 2) { this.failWith(result); return false; }
        return this.refresh();
      }
      this.handleFailure(result, () => void this.pump());
      return false;
    }
    this.failures = 0;
    this.set({ network: "online" });
    switch (result.kind) {
      case "saved":
        this.knownRejections = 0;
        this.set({ drafts: { ...acknowledge(this.state.drafts, result.answersVersion), version: result.state.attempt.answersVersion } });
        this.applyBrief(result.state);
        await this.persist();
        // An old receipt can acknowledge only its own patch. Read the newer answers separately.
        if (result.state.attempt.answersVersion > result.answersVersion) return this.refresh();
        return true;
      case "conflict":
        this.set({ drafts: reject(this.state.drafts) });
        return this.refresh();
      case "finalized":
        await this.finish(result.state);
        return false;
      case "editor_lost":
        if (result.acknowledgedVersion !== null) this.set({ drafts: acknowledge(this.state.drafts, result.acknowledgedVersion) });
        this.set({ drafts: reject(this.state.drafts) });
        await this.persist();
        if (!(await this.afterLost(result.reason))) return false;
        return this.refresh();
    }
  }

  private async afterLost(reason: "expired" | "replaced") {
    if (!(await this.reclaim())) return false;
    // Another editor may have saved meanwhile: reconcile before building new commands.
    if (reason === "replaced" && !this.state.drafts.inflight) return this.refresh();
    return true;
  }

  /** Confirmed in the dialog: freeze answers, flush them, then submit what the server acknowledged. */
  confirmSubmit() {
    if (this.state.phase !== "ready" || Object.keys(this.state.drafts.conflicts).length > 0) return;
    this.clearTimer("flush");
    this.submission = { key: null, expectedVersion: null, generation: this.generation };
    this.set({ phase: "submitting", submitStage: "saving", notice: null });
    void this.persist();
    void this.pump();
  }

  private async sendSubmit() {
    if (Object.keys(this.state.drafts.conflicts).length > 0) {
      // Reconciliation found answers changed elsewhere: back to the exam to review them.
      this.submission = null;
      this.set({ phase: "ready", submitStage: null, notice: "Some answers changed in another tab or device. Review them and submit again." });
      await this.persist();
      return;
    }
    if (!this.submission?.key) {
      this.submission = { key: this.deps.uuid(), expectedVersion: this.state.drafts.version, generation: this.generation };
      await this.persist();
    }
    const { key, expectedVersion, generation } = this.submission as { key: string; expectedVersion: number; generation: number };
    this.set({ submitStage: "sending" });
    const result = await this.deps.api.submit(this.token, expectedVersion, key, generation);
    if (this.ended()) return;
    if (!result.ok) {
      this.set({ submitStage: "waiting" });
      this.handleFailure(result, () => void this.pump());
      return;
    }
    this.failures = 0;
    if (result.kind === "conflict") {
      // Not accepted: the acknowledged version moved. Reconcile and try again with a new key.
      this.submission = { key: null, expectedVersion: null, generation: this.generation };
      this.set({ submitStage: "saving" });
      if (await this.refresh()) void this.pump();
      return;
    }
    if (result.kind === "editor_lost") {
      if (await this.afterLost(result.reason)) {
        this.submission = { key: null, expectedVersion: null, generation: this.generation };
        await this.refresh(); void this.pump();
      }
      return;
    }
    await this.finish(result.state);
  }

  // -------------------------------------------------------------------------------------------
  // Departures (EDRA-234 detects; this delivers with the editor token and applies the outcome).

  /**
   * Records one logical departure from the current question. The event is stored first, retried
   * with the same id until acknowledged, and redelivered after a refresh. Resolves with the server
   * outcome (warned/duplicate move to the returned question; kicked/finalized end the session).
   */
  recordDeparture(eventId: string = this.deps.uuid()): Promise<StudentExamDepartureOutcome | null> {
    const questionId = this.departure?.questionId ?? this.state.currentId;
    if (!questionId || this.state.phase === "finished" || this.state.phase === "loading") return Promise.resolve(null);
    if (!this.departure) this.departure = { eventId, questionId, generation: this.generation };
    const pending = this.departure.eventId;
    const promise = new Promise<StudentExamDepartureOutcome | null>((done) => {
      this.departureWaiters.set(pending, [...(this.departureWaiters.get(pending) ?? []), done]);
    });
    this.set({ pendingDeparture: true });
    void this.persist().then(() => this.deliverPendingDeparture());
    return promise;
  }

  private settleDeparture(eventId: string, outcome: StudentExamDepartureOutcome | null) {
    this.departure = null;
    this.set({ pendingDeparture: false });
    for (const done of this.departureWaiters.get(eventId) ?? []) done(outcome);
    this.departureWaiters.delete(eventId);
  }

  private deliverPendingDeparture(): Promise<boolean> {
    if (!this.departure || this.ended()) return Promise.resolve(false);
    if (this.delivering) return this.delivering;
    this.delivering = this.deliverDeparture().finally(() => { this.delivering = null; });
    return this.delivering;
  }

  private async deliverDeparture(): Promise<boolean> {
    const { eventId, questionId, generation } = this.departure!;
    const result = await this.deps.api.departure(this.token, eventId, questionId, generation);
    if (this.ended()) return false;
    if (!result.ok) {
      if (result.code === "unknown_question") { this.settleDeparture(eventId, null); await this.persist(); return true; }
      if (this.retryable(result)) this.retryLater("departure-retry", () => void this.deliverPendingDeparture(), result);
      else this.failWith(result);
      return false;
    }
    this.failures = 0;
    if (result.kind === "editor_lost") {
      this.settleDeparture(eventId, result);
      await this.persist();
      return this.afterLost(result.reason);
    }
    if (result.kind !== "warned" && result.kind !== "duplicate") {
      this.settleDeparture(eventId, result);
      await this.finish(result.state);
      return false;
    }
    this.applyBrief(result.state);
    const next = result.departure?.nextQuestionId;
    if (result.departure) this.set({ currentId: next && this.answerable(next) ? next : null });
    this.settleDeparture(eventId, result);
    await this.persist();
    return true;
  }

  // -------------------------------------------------------------------------------------------
  // Failures.

  private retryable(failure: StudentExamFailure) {
    return failure.code === "unavailable" || failure.code === "throttled";
  }

  private retryLater(name: string, run: () => void, failure: StudentExamFailure) {
    const delay = Math.max(BACKOFF[Math.min(this.failures, BACKOFF.length - 1)], (failure.retryAfter ?? 0) * 1000);
    this.failures += 1;
    if (failure.code === "unavailable") this.set({ network: "offline" });
    this.timer(name, run, delay);
  }

  /** Unknown outcomes retry the same operation later; definitive refusals stop the session. */
  private handleFailure(failure: StudentExamFailure, retry: () => void) {
    if (this.retryable(failure)) { this.retryLater("retry", retry, failure); return; }
    this.failWith(failure);
  }

  private failWith(failure: StudentExamFailure) {
    const reason = BLOCKING[failure.code] ?? "error";
    this.set({ phase: "blocked", block: { reason, message: failure.message }, saving: false });
  }

  // -------------------------------------------------------------------------------------------
  // Persistence and the end.

  private entry(): JournalEntry | null {
    const attempt = this.state.attempt;
    if (!this.accountId || !attempt) return null;
    const { drafts, seq, inflight } = this.state.drafts;
    if (Object.keys(drafts).length === 0 && !inflight && !this.submission && !this.departure) return null;
    return {
      schema: JOURNAL_SCHEMA, accountId: this.accountId, attemptId: attempt.id, examId: this.deps.examId, drafts, seq, inflight,
      submission: this.submission, departure: this.departure, updatedAt: Date.now(),
    };
  }

  /** Queues a write of the latest pending state; writes run one at a time. Nothing pending: the entry is removed. */
  private persist(): Promise<void> {
    if (this.state.stored) this.set({ stored: false });
    if (!this.writeQueued) {
      this.writeQueued = true;
      this.writes = this.writes.then(async () => {
        this.writeQueued = false;
        await this.write();
      });
    }
    return this.writes;
  }

  private async write() {
    const store = this.deps.journal;
    if (this.disposed || !store || !this.accountId || !this.state.attempt || this.state.phase === "finished") return;
    const key = journalKey(this.accountId, this.state.attempt.id);
    const entry = this.entry();
    try {
      if (entry) await store.put(key, entry);
      else await store.delete(key);
      if (this.state.journal !== "ok" || !this.state.stored) this.set({ journal: "ok", stored: !this.writeQueued });
    } catch {
      this.set({ journal: "unavailable", stored: false });
    }
  }

  private async finish(terminal: StudentExamTerminal) {
    if (this.state.phase === "finished") return;
    for (const handle of this.timers.values()) this.deps.clearTimer(handle);
    this.timers.clear();
    this.submission = null;
    const departure = this.departure;
    if (departure) this.settleDeparture(departure.eventId, null);
    this.set({ phase: "finished", questions: [], drafts: createDrafts({}, 0), currentId: null, terminal, attempt: terminal.attempt, saving: false, submitStage: null, block: null });
    // Answers not accepted before finalization never count: drop every pending entry of this attempt
    // once any write already under way has landed.
    void this.deps.api.release(this.token).catch(() => { /* Terminal state is already authoritative. */ });
    await this.writes;
    const store = this.deps.journal;
    if (store) {
      try {
        await store.delete(journalKey(terminal.accountId, terminal.attempt.id));
      } catch { /* Storage unavailable: nothing was kept there. */ }
    }
  }

  pendingCount() {
    return pendingCount(this.state.drafts);
  }
}
