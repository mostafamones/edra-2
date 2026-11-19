import type { AddAttendeeResult, AttendanceEntry, AttendeeCandidate, AttendeeCandidates } from './contract.ts'
import { failureMessage, newKey, readMessage, writeOutcome } from './outcome.ts'
import { Model, type APIError, type Ownership, type RequestPort } from './port.ts'

export const ATTENDEES_PAGE_SIZE = 20

/** The chosen student, the revision shown when chosen, and the key for this add. */
export interface AttendeeChoice {
  candidate: AttendeeCandidate
  revision: number
  key: string
}

export type SearchPhase = { kind: 'idle' } | { kind: 'loading' } | { kind: 'loaded' } | { kind: 'failed'; message: string }

/**
 * Finds a student of the session's academy and year who isn't on the roster and explicitly adds them
 * as an unexpected attendee. Searching writes nothing; adding never checks the student in.
 */
export class AddAttendeeModel extends Model {
  query: string
  phase: SearchPhase = { kind: 'idle' }
  items: AttendeeCandidate[] = []
  hasMore = false
  isLoadingMore = false
  chosen: AttendeeChoice | null = null
  isAdding = false
  message: string | null = null
  /** Set once the server acknowledged the add (or that the student was already on the roster). */
  added: AttendanceEntry | null = null
  alreadyOnRoster = false
  private generation = 0

  private readonly deps: {
    api: RequestPort
    sessionId: string
    /** The sheet revision currently shown. */
    revision: () => number | null
    isCurrent: () => boolean
    /** Refreshes the sheet: an append changes the revision, so open reviews must be redone. */
    onAdded: () => Promise<void>
    owner: Ownership
    newKey: () => string
  }

  constructor(deps: Omit<AddAttendeeModel['deps'], 'newKey'> & { newKey?: () => string; query?: string }) {
    super()
    this.deps = { newKey, ...deps }
    this.query = deps.query ?? ''
  }

  setQuery(query: string) {
    this.query = query
    this.changed()
  }

  private path(offset: number) {
    const q = encodeURIComponent(this.query.trim().slice(0, 100))
    return `api/v1/sessions/${this.deps.sessionId}/attendance/attendees?q=${q}&limit=${ATTENDEES_PAGE_SIZE}&offset=${offset}`
  }

  /** Runs the current query from the first page. */
  async search() {
    const generation = ++this.generation
    this.phase = { kind: 'loading' }
    this.changed()
    const result = await this.deps.api.get<AttendeeCandidates>(this.path(0), { structuredErrors: true })
    if (generation !== this.generation || !this.deps.isCurrent()) return
    if (!result.ok) return this.fail(result.error)
    this.items = result.value.items
    this.hasMore = result.value.has_more
    this.phase = { kind: 'loaded' }
    const chosen = this.chosen
    if (chosen && !this.items.some((c) => c.annual_student_record_id === chosen.candidate.annual_student_record_id)) this.chosen = null
    this.changed()
  }

  async loadMore() {
    if (!this.hasMore || this.isLoadingMore || this.phase.kind !== 'loaded') return
    const generation = this.generation
    this.isLoadingMore = true
    this.changed()
    const result = await this.deps.api.get<AttendeeCandidates>(this.path(this.items.length), { structuredErrors: true })
    if (generation !== this.generation || !this.deps.isCurrent()) return
    this.isLoadingMore = false
    if (!result.ok) return this.fail(result.error)
    const known = new Set(this.items.map((c) => c.annual_student_record_id))
    this.items = [...this.items, ...result.value.items.filter((c) => !known.has(c.annual_student_record_id))]
    this.hasMore = result.value.has_more
    this.changed()
  }

  private async fail(error: APIError) {
    if (error.kind === 'unauthenticated') return this.deps.owner.onUnauthenticated()
    if (error.kind === 'forbidden') {
      this.items = []
      this.phase = { kind: 'failed', message: 'You no longer have access to this session.' }
      this.changed()
      return this.deps.owner.onForbidden()
    }
    if (error.kind === 'cancelled') {
      if (this.phase.kind === 'loading') this.phase = { kind: 'idle' }
    } else {
      this.phase = { kind: 'failed', message: readMessage(error) }
    }
    this.changed()
  }

  choose(candidate: AttendeeCandidate) {
    const revision = this.deps.revision()
    if (this.isAdding || revision === null) return
    this.message = null
    this.chosen = { candidate, revision, key: this.deps.newKey() }
    this.changed()
  }

  /** The sheet changed after the student was chosen: Add needs a deliberate review first. */
  get choiceIsStale() {
    const current = this.deps.revision()
    return !!this.chosen && current !== null && this.chosen.revision !== current
  }

  /** Adds the chosen student, or retries the unacknowledged add unchanged. */
  async add() {
    const choice = this.chosen
    if (!choice || this.isAdding || this.added) return
    this.isAdding = true
    this.message = null
    this.changed()
    try {
      const result = await this.deps.api.post<AddAttendeeResult>(
        `api/v1/sessions/${this.deps.sessionId}/attendance/attendees`,
        { annual_student_record_id: choice.candidate.annual_student_record_id, expected_revision: choice.revision },
        { idempotencyKey: choice.key, structuredErrors: true },
      )
      if (!this.deps.isCurrent() || this.chosen !== choice) return
      if (result.ok) {
        this.added = result.value.entry
        this.alreadyOnRoster = result.value.outcome === 'already_on_roster'
        this.changed()
        return await this.deps.onAdded()
      }
      const outcome = writeOutcome(result.error)
      switch (outcome.kind) {
        case 'unauthenticated':
          return await this.deps.owner.onUnauthenticated()
        case 'forbidden':
          this.chosen = null
          this.message = 'You no longer have access to this session.'
          return await this.deps.owner.onForbidden()
        case 'cancelled':
          return
        case 'uncertain':
          this.message = outcome.message // the same choice and key are retried
          return
        case 'rejected':
          this.chosen = null
          if (outcome.failure.code === 'ATTENDANCE_REVIEW_STALE') {
            this.message = 'Attendance changed meanwhile. Choose the student again to add them.'
            await this.deps.onAdded() // refresh the sheet so the new revision is reviewed
          } else {
            this.message = failureMessage(outcome.failure)
          }
          return await this.search()
      }
    } finally {
      this.isAdding = false
      this.changed()
    }
  }
}
