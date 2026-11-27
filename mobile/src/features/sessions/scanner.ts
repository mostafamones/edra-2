import type { AttendanceEntry, AttendanceSheet, CheckInResult } from './contract.ts'
import { failureMessage, newKey, writeOutcome } from './outcome.ts'
import { Model, type Ownership, type RequestPort } from './port.ts'

export interface CodeCard {
  code: string
  entry: AttendanceEntry
}

/** One check-in exactly as first sent: previewed student, code, Late-after captured at Confirm, and key. */
export interface CheckInAttempt {
  card: CodeCard
  lateAfterMinutes: number
  key: string
}

export type ScannerState =
  | { kind: 'scanning' }
  | { kind: 'awaitingDecision'; card: CodeCard }
  | { kind: 'submitting'; attempt: CheckInAttempt }
  /** Unknown outcome (no response, 5xx, 429, unreadable reply). Retry resends the attempt unchanged. */
  | { kind: 'uncertain'; attempt: CheckInAttempt; message: string }
  /** Definitive answer; this attempt recorded nothing. */
  | { kind: 'rejected'; card: CodeCard; message: string }
  /** Code not on the loaded roster. Nothing was written; staff may add the student explicitly. */
  | { kind: 'notOnRoster'; code: string }

/** Same normalization the server applies: trim, uppercase, 1–20 of A-Z 0-9 -. Leading zeroes kept. */
export function normalizeCode(raw: string): string | null {
  const code = raw.trim().toUpperCase()
  return /^[A-Z0-9-]{1,20}$/.test(code) ? code : null
}

/**
 * Student-code preview and confirm, one student at a time. Preview resolves against the loaded roster
 * and writes nothing; the server revalidates the code and session on Confirm.
 */
export class ScannerModel extends Model {
  state: ScannerState = { kind: 'scanning' }
  /** Short-lived success text; the screen shows and clears it. */
  notice: string | null = null
  /** Codes ignored until they leave the camera view. */
  private suppressed = new Set<string>()

  private readonly deps: {
    api: RequestPort
    sessionId: string
    sheet: () => AttendanceSheet | null
    lateAfterMinutes: () => number
    refresh: () => Promise<void>
    isCurrent: () => boolean
    owner: Ownership
    newKey: () => string
  }

  constructor(deps: Omit<ScannerModel['deps'], 'newKey'> & { newKey?: () => string }) {
    super()
    this.deps = { newKey, ...deps }
  }

  /** Why a new check-in can't start. An uncertain attempt can still be retried (its receipt replays). */
  get blockedReason(): string | null {
    const sheet = this.deps.sheet()
    if (!sheet) return "Attendance isn't loaded yet."
    if (sheet.session.archived_at) return 'This session was archived. Its attendance is read-only.'
    if (sheet.session.state !== 'live') return 'This session has ended.'
    if (!sheet.permitted_actions.check_in) return "You can't record attendance for this session."
    if (!sheet.student_codes_enabled) return 'Student codes are off for this academy.'
    return null
  }

  get canAddAttendee() {
    return this.deps.sheet()?.permitted_actions.edit === true
  }

  /** Called with every code currently visible (empty when none), or once with a typed code. */
  recognized(codes: string[]) {
    const visible = new Set(codes.map(normalizeCode).filter((c): c is string => c !== null))
    for (const code of this.suppressed) if (!visible.has(code)) this.suppressed.delete(code) // left the view: scannable again
    if (this.state.kind !== 'scanning' || this.blockedReason) return
    const code = [...visible].filter((c) => !this.suppressed.has(c)).sort()[0]
    if (!code) return
    this.suppressed.add(code)
    const entry = this.deps.sheet()?.entries.find((e) => e.student_code?.toUpperCase() === code)
    this.state = entry ? { kind: 'awaitingDecision', card: { code, entry } } : { kind: 'notOnRoster', code }
    this.changed()
  }

  /** Ends the current card or attempt. An uncertain attempt is abandoned deliberately. */
  dismiss() {
    if (this.state.kind === 'scanning' || this.state.kind === 'submitting') return
    this.state = { kind: 'scanning' }
    this.changed()
  }

  /** After staff added a student from `notOnRoster`, the same card may be scanned again. */
  returnFromAdd(code: string) {
    this.suppressed.delete(code)
    if (this.state.kind === 'notOnRoster' && this.state.code === code) this.state = { kind: 'scanning' }
    this.changed()
  }

  clearNotice() {
    this.notice = null
    this.changed()
  }

  async confirm() {
    let attempt: CheckInAttempt
    if (this.state.kind === 'awaitingDecision') {
      if (this.blockedReason) return
      // Late-after is captured now; Retry never re-reads it.
      attempt = { card: this.state.card, lateAfterMinutes: this.deps.lateAfterMinutes(), key: this.deps.newKey() }
    } else if (this.state.kind === 'uncertain') {
      attempt = this.state.attempt
    } else {
      return // blocks duplicate taps and any submission of a different student
    }
    const submitting: ScannerState = { kind: 'submitting', attempt }
    this.state = submitting
    this.changed()

    const result = await this.deps.api.post<CheckInResult>(
      `api/v1/sessions/${this.deps.sessionId}/check-ins`,
      { student_id: attempt.card.code, ...(attempt.lateAfterMinutes > 0 ? { late_after_minutes: attempt.lateAfterMinutes } : {}) },
      { idempotencyKey: attempt.key, structuredErrors: true },
    )
    if (!this.deps.isCurrent() || this.state !== submitting) return

    if (result.ok) {
      const { outcome, entry } = result.value
      this.state = { kind: 'scanning' }
      this.notice =
        outcome === 'already_recorded'
          ? `${entry.full_name} was already checked in.`
          : entry.status === 'late'
            ? `${entry.full_name} checked in late.`
            : `${entry.full_name} checked in.`
      this.changed()
      return this.deps.refresh() // a replayed receipt may describe an earlier state
    }
    const outcome = writeOutcome(result.error)
    switch (outcome.kind) {
      case 'unauthenticated':
        this.state = { kind: 'uncertain', attempt, message: 'Sign in again, then retry.' }
        this.changed()
        return this.deps.owner.onUnauthenticated()
      case 'forbidden':
        this.state = { kind: 'rejected', card: attempt.card, message: 'You no longer have access to record attendance here.' }
        this.changed()
        return this.deps.owner.onForbidden()
      case 'cancelled':
        this.state = { kind: 'uncertain', attempt, message: "Couldn't confirm with the server. Retry to be sure." }
        return this.changed()
      case 'uncertain':
        this.state = { kind: 'uncertain', attempt, message: outcome.message }
        return this.changed()
      case 'rejected': {
        const current = outcome.failure.code === 'REVIEW_REQUIRED' ? reviewEntry(outcome.failure.details) : null
        // Absent or Excused is never overwritten by a scan: show the server's current entry.
        this.state = current
          ? {
              kind: 'rejected',
              card: { code: attempt.card.code, entry: current },
              message: `${current.full_name} is marked ${statusLabel(current.status)}. Change it on the session screen if they arrived.`,
            }
          : { kind: 'rejected', card: attempt.card, message: failureMessage(outcome.failure) }
        this.changed()
        return this.deps.refresh()
      }
    }
  }
}

function reviewEntry(details: unknown): AttendanceEntry | null {
  const entry = (details as { entry?: AttendanceEntry } | null)?.entry
  return entry && typeof entry.full_name === 'string' && typeof entry.status === 'string' ? entry : null
}

export const statusLabel = (status: string) => (status === 'unknown' ? '—' : status[0].toUpperCase() + status.slice(1))
