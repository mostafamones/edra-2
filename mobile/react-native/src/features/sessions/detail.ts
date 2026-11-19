import type {
  AttendanceEntry,
  AttendanceSheet,
  AttendanceStatus,
  LiveSession,
  PublishResult,
  SetAttendanceResult,
  UnrecordedAbsenceResult,
} from './contract.ts'
import { failureMessage, newKey, readMessage, writeOutcome } from './outcome.ts'
import { Model, type Ownership, type RequestPort } from './port.ts'
import { AddAttendeeModel } from './attendees.ts'
import { ScannerModel } from './scanner.ts'

/** A status change exactly as first sent, kept until acknowledged or discarded. */
export interface StatusCommand {
  entryId: string
  fullName: string
  status: AttendanceStatus
  expectedVersion: number
  key: string
}

/** A reviewed command (finalize, mark rest absent): the revision staff reviewed and its key. */
export interface ReviewedCommand {
  revision: number
  key: string
}

export type SheetState = { kind: 'loading' } | { kind: 'loaded' } | { kind: 'failed'; message: string }
export type Official = 'notFinalized' | 'finalized' | 'correctionsPending'

/** Per-session Late-after minutes, kept on this device. */
export interface LateAfterStore {
  get(sessionId: string): number | undefined
  set(sessionId: string, minutes: number): void
}

export const MAX_LATE_AFTER_MINUTES = 1440

/** Parses Late-after input: empty is 0 (never Late), otherwise a whole number 0…1440, else null. */
export function parseLateAfter(text: string): number | null {
  const trimmed = text.trim()
  if (!trimmed) return 0
  if (!/^\d+$/.test(trimmed)) return null
  const value = Number(trimmed)
  return value <= MAX_LATE_AFTER_MINUTES ? value : null
}

export const isCheckedIn = (entry: AttendanceEntry) => entry.status === 'present' || entry.status === 'late'

export const official = (sheet: AttendanceSheet): Official =>
  sheet.publication === 'published' ? 'finalized' : sheet.publication === 'pending_corrections' ? 'correctionsPending' : 'notFinalized'

/** Expected students still Unknown: the target of "Mark rest absent". */
export const unrecordedExpected = (sheet: AttendanceSheet) =>
  sheet.entries.filter((e) => e.origin === 'expected' && e.status === 'unknown').length

const sameSession = (a: AttendanceSheet['session'], b: AttendanceSheet['session']) =>
  a.mandatory === b.mandatory &&
  a.state === b.state &&
  (a.archived_at ?? null) === (b.archived_at ?? null) &&
  a.year_open === b.year_open &&
  a.metadata_version === b.metadata_version

export interface SessionDeps {
  api: RequestPort
  /** False once the account scope or academy selection this screen was opened in has ended. */
  isCurrent: () => boolean
  owner: Ownership
  newKey?: () => string
  lateAfter?: LateAfterStore
  now?: () => Date
}

/** One session's attendance screen, owned by the account and academy selection it was opened in. */
export class SessionDetailModel extends Model {
  readonly session: LiveSession
  state: SheetState = { kind: 'loading' }
  sheet: AttendanceSheet | null = null
  lastRefreshed: Date | null = null
  /** A background refresh failed: the shown sheet may be out of date. */
  refreshProblem: string | null = null
  /** Show every roster student instead of only those checked in. */
  showAll = false
  lateAfterMinutes: number

  // Finalization
  isPublishing = false
  publishMessage: string | null = null
  /** Revision captured when the finalize review opened. */
  finalizeReview: number | null = null
  /** Unacknowledged finalize, retried with the same revision and key. */
  publishCommand: ReviewedCommand | null = null

  // Mark rest absent
  isBulkSaving = false
  absenceReview: number | null = null
  absenceCommand: ReviewedCommand | null = null

  // Status changes
  statusError: string | null = null
  notice: string | null = null
  /** Unacknowledged status changes by entry: one per student, so students never share a key. */
  statusCommands = new Map<string, StatusCommand>()
  savingEntries = new Set<string>()

  private generation = 0
  private readonly deps: Required<Omit<SessionDeps, 'lateAfter'>> & { lateAfter?: LateAfterStore }

  constructor(session: LiveSession, deps: SessionDeps) {
    super()
    this.session = session
    this.deps = { newKey, now: () => new Date(), ...deps }
    this.lateAfterMinutes = deps.lateAfter?.get(session.id) ?? 0
  }

  get canEdit() {
    return this.sheet?.permitted_actions.edit === true
  }
  get canPublish() {
    return this.sheet?.permitted_actions.publish === true && !this.isPublishing
  }
  get isArchived() {
    return !!this.sheet?.session.archived_at
  }
  get official(): Official | null {
    return this.sheet ? official(this.sheet) : null
  }
  /** A save landed after the review opened: finalizing needs a deliberate review of the latest values. */
  get finalizeReviewIsStale() {
    return !this.publishCommand && this.finalizeReview !== null && !!this.sheet && this.finalizeReview !== this.sheet.revision
  }
  /** Present or Late, newest check-in first. */
  get checkedIn() {
    return (this.sheet?.entries ?? []).filter(isCheckedIn).sort((a, b) => time(b.checked_in_at) - time(a.checked_in_at))
  }
  get visibleEntries() {
    if (!this.showAll) return this.checkedIn
    const rest = (this.sheet?.entries ?? [])
      .filter((e) => !isCheckedIn(e))
      .sort((a, b) => a.full_name.localeCompare(b.full_name, undefined, { sensitivity: 'base' }))
    return [...this.checkedIn, ...rest]
  }
  /** Expected students still Unknown in a mandatory session (never eligible or added students). */
  get unrecordedCount() {
    return this.sheet?.session.mandatory ? unrecordedExpected(this.sheet) : 0
  }
  get canMarkRestAbsent() {
    return this.canEdit && (this.unrecordedCount > 0 || !!this.absenceCommand) && !this.isBulkSaving
  }
  /** The status change awaiting Retry, if any. */
  get uncertainStatus() {
    return [...this.statusCommands.values()].find((c) => !this.savingEntries.has(c.entryId)) ?? null
  }

  setShowAll(value: boolean) {
    this.showAll = value
    this.changed()
  }

  clearMessages() {
    this.publishMessage = this.statusError = this.notice = null
    this.changed()
  }

  setLateAfter(minutes: number) {
    this.lateAfterMinutes = Math.min(Math.max(Math.trunc(minutes) || 0, 0), MAX_LATE_AFTER_MINUTES)
    this.deps.lateAfter?.set(this.session.id, this.lateAfterMinutes)
    this.changed()
  }

  // MARK: Loading

  async load() {
    const generation = ++this.generation
    if (!this.sheet) this.state = { kind: 'loading' }
    const result = await this.deps.api.get<AttendanceSheet>(`api/v1/sessions/${this.session.id}/attendance`)
    // Only the newest load for this screen's account and academy commits, success or failure.
    if (generation !== this.generation || !this.deps.isCurrent()) return
    if (result.ok) return this.apply(result.value)
    const { error } = result
    switch (error.kind) {
      case 'unauthenticated':
        return this.deps.owner.onUnauthenticated()
      case 'forbidden':
        this.sheet = null
        this.state = { kind: 'failed', message: 'You no longer have access to this session.' }
        return this.forbidden()
      case 'cancelled':
        if (!this.sheet && this.state.kind === 'loading') this.state = { kind: 'failed', message: "Attendance didn't load. Try again." }
        break
      default:
        if (this.sheet) this.refreshProblem = readMessage(error)
        else this.state = { kind: 'failed', message: readMessage(error) }
    }
    this.changed()
  }

  private apply(next: AttendanceSheet) {
    // A lower revision with the same lifecycle state is older data; lifecycle/archive changes apply at any revision.
    const current = this.sheet
    if (current && next.revision < current.revision && sameSession(next.session, current.session)) return
    this.sheet = next
    this.state = { kind: 'loaded' }
    this.lastRefreshed = this.deps.now()
    this.refreshProblem = null
    this.changed()
  }

  /** Reloads every `intervalMs` while the screen is visible; returns a stop function. */
  refreshWhileVisible(intervalMs = 10_000) {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      await this.load()
      if (!stopped) timer = setTimeout(tick, intervalMs)
    }
    void tick()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }

  /** Access may be gone: no retry key survives into a later, separately authorized action. */
  async forbidden() {
    this.publishCommand = this.absenceCommand = null
    this.finalizeReview = this.absenceReview = null
    this.statusCommands.clear()
    this.changed()
    await this.deps.owner.onForbidden()
  }

  /** Code preview/confirm bound to this screen's sheet, Late-after, refresh and ownership. */
  makeScanner() {
    return new ScannerModel({
      api: this.deps.api,
      sessionId: this.session.id,
      sheet: () => this.sheet,
      lateAfterMinutes: () => this.lateAfterMinutes,
      refresh: () => this.load(),
      isCurrent: this.deps.isCurrent,
      owner: { onUnauthenticated: () => this.deps.owner.onUnauthenticated(), onForbidden: () => this.forbidden() },
      newKey: this.deps.newKey,
    })
  }

  /** Explicit add-attendee search, optionally prefilled (e.g. with an unknown scanned code). */
  makeAttendees(query = '') {
    return new AddAttendeeModel({
      api: this.deps.api,
      sessionId: this.session.id,
      query,
      revision: () => this.sheet?.revision ?? null,
      isCurrent: this.deps.isCurrent,
      onAdded: () => this.load(),
      owner: { onUnauthenticated: () => this.deps.owner.onUnauthenticated(), onForbidden: () => this.forbidden() },
      newKey: this.deps.newKey,
    })
  }

  private async signOut() {
    if (this.deps.isCurrent()) await this.deps.owner.onUnauthenticated()
  }

  // MARK: Finalize

  /** Opens the finalize review at the current revision (or the unacknowledged command's revision). */
  beginFinalizeReview() {
    this.finalizeReview = this.publishCommand?.revision ?? this.sheet?.revision ?? null
    this.changed()
  }

  endFinalizeReview() {
    if (!this.publishCommand) this.finalizeReview = null
    this.changed()
  }

  async publish() {
    const reviewed = this.publishCommand?.revision ?? this.finalizeReview
    if (!this.canPublish || reviewed === null) return
    // A newer revision is never finalized silently: the review must be redone first.
    if (!this.publishCommand && reviewed !== this.sheet?.revision) return
    const command = this.publishCommand ?? { revision: reviewed, key: this.deps.newKey() }
    this.publishCommand = command
    this.isPublishing = true
    this.changed()
    try {
      const result = await this.deps.api.post<PublishResult>(
        `api/v1/sessions/${this.session.id}/attendance/publications`,
        { expected_revision: command.revision },
        { idempotencyKey: command.key, structuredErrors: true },
      )
      if (!this.deps.isCurrent()) return
      if (result.ok) {
        this.publishCommand = null
        this.finalizeReview = null
        const { outcome, item_count } = result.value
        this.publishMessage =
          outcome === 'published'
            ? `Attendance finalized (${item_count} records).`
            : outcome === 'unchanged'
              ? 'Nothing to finalize. Attendance already matches the official record.'
              : 'This attendance was already finalized.'
        return await this.load()
      }
      const outcome = writeOutcome(result.error)
      switch (outcome.kind) {
        case 'unauthenticated':
          return await this.signOut()
        case 'forbidden':
          this.publishMessage = "You can't finalize attendance for this session."
          return await this.forbidden()
        case 'cancelled':
          return
        case 'uncertain':
          this.publishMessage = outcome.message
          return
        case 'rejected':
          this.publishCommand = null
          this.finalizeReview = null
          this.publishMessage = failureMessage(outcome.failure)
          return await this.load() // e.g. the sheet changed since it was reviewed
      }
    } finally {
      this.isPublishing = false
      this.changed()
    }
  }

  // MARK: Mark rest absent

  beginAbsenceReview() {
    this.absenceReview = this.absenceCommand?.revision ?? this.sheet?.revision ?? null
    this.changed()
  }

  /** Marks every expected Unknown student Absent, all or nothing at any roster size, against the reviewed revision. */
  async markRestAbsent() {
    const reviewed = this.absenceCommand?.revision ?? this.absenceReview
    if (this.isBulkSaving || !this.canEdit || reviewed === null) return
    if (!this.absenceCommand && reviewed !== this.sheet?.revision) {
      this.absenceReview = null
      this.statusError = 'Attendance changed while you were reviewing. Review the latest values and try again.'
      return this.changed()
    }
    const command = this.absenceCommand ?? { revision: reviewed, key: this.deps.newKey() }
    this.absenceCommand = command
    this.isBulkSaving = true
    this.changed()
    try {
      const result = await this.deps.api.post<UnrecordedAbsenceResult>(
        `api/v1/sessions/${this.session.id}/attendance/unrecorded-absences`,
        { expected_revision: command.revision },
        { idempotencyKey: command.key, structuredErrors: true },
      )
      if (!this.deps.isCurrent()) return
      if (result.ok) {
        this.absenceCommand = null
        this.absenceReview = null
        const { changed } = result.value
        this.notice = changed === 0 ? 'No unrecorded students were left.' : `${changed} ${changed === 1 ? 'student' : 'students'} marked absent.`
        return await this.load()
      }
      const outcome = writeOutcome(result.error)
      switch (outcome.kind) {
        case 'unauthenticated':
          return await this.signOut()
        case 'forbidden':
          this.statusError = "You can't change attendance for this session."
          return await this.forbidden()
        case 'cancelled':
          return
        case 'uncertain':
          this.statusError = outcome.message
          return
        case 'rejected':
          this.absenceCommand = null
          this.absenceReview = null
          this.statusError = failureMessage(outcome.failure)
          return await this.load()
      }
    } finally {
      this.isBulkSaving = false
      this.changed()
    }
  }

  /** Abandons an unacknowledged mark-rest-absent command (staff checked the sheet themselves). */
  discardAbsenceCommand() {
    if (this.isBulkSaving) return
    this.absenceCommand = this.absenceReview = null
    this.changed()
  }

  // MARK: Status changes

  async changeStatus(status: AttendanceStatus, entry: AttendanceEntry) {
    const id = entry.annual_student_record_id
    if (this.savingEntries.has(id)) return
    const pending = this.statusCommands.get(id)
    if (pending) {
      // Only the exact unacknowledged change may be resent; never a new one on an invented version.
      if (pending.status !== status) {
        this.statusError = `The earlier change for ${entry.full_name} isn't confirmed yet. Retry or discard it first.`
        return this.changed()
      }
      return this.send(pending)
    }
    if (status === entry.status || !this.canEdit) return
    return this.send({ entryId: id, fullName: entry.full_name, status, expectedVersion: entry.version, key: this.deps.newKey() })
  }

  async retryStatus(command: StatusCommand) {
    if (this.statusCommands.get(command.entryId) === command) return this.send(command)
  }

  discardStatus(command: StatusCommand) {
    if (this.savingEntries.has(command.entryId)) return
    this.statusCommands.delete(command.entryId)
    this.changed()
  }

  private async send(command: StatusCommand) {
    this.statusCommands.set(command.entryId, command)
    this.savingEntries.add(command.entryId)
    this.changed()
    try {
      const result = await this.deps.api.patch<SetAttendanceResult>(
        `api/v1/sessions/${this.session.id}/attendance/${command.entryId}`,
        { status: command.status, expected_version: command.expectedVersion },
        { idempotencyKey: command.key, structuredErrors: true },
      )
      if (!this.deps.isCurrent()) return
      if (result.ok) {
        this.statusCommands.delete(command.entryId)
        return await this.load()
      }
      const outcome = writeOutcome(result.error)
      switch (outcome.kind) {
        case 'unauthenticated':
          return await this.signOut()
        case 'forbidden':
          this.statusError = "You can't change attendance for this session."
          return await this.forbidden()
        case 'cancelled':
          return
        case 'uncertain':
          this.statusError = outcome.message
          return
        case 'rejected':
          this.statusCommands.delete(command.entryId)
          this.statusError = failureMessage(outcome.failure)
          return await this.load() // e.g. someone else changed it first: review the current value
      }
    } finally {
      this.savingEntries.delete(command.entryId)
      this.changed()
    }
  }
}

const time = (iso: string | null | undefined) => (iso ? Date.parse(iso) : 0)
