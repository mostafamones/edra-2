import type { LiveSession, StartableSchedule, StartSessionResult } from './contract.ts'
import { newKey, readMessage } from './outcome.ts'
import { Model, sameContext, type AcademyContext, type Ownership, type RequestPort } from './port.ts'

/** One logical start: kept with its key for the same academy/schedule until acknowledged. */
export interface StartAttempt {
  context: AcademyContext
  academyName: string
  scheduleId: string
  scheduleTitle: string
  key: string
}

export type StartPhase =
  | { kind: 'idle' }
  | { kind: 'starting' }
  /** No acknowledgment arrived; Retry reuses the key and can't start a second session. */
  | { kind: 'uncertain'; message: string }
  | { kind: 'failed'; message: string }

/** Starts a session from a chosen schedule (or opens its live one) and hands the server's session to navigation. */
export class StartSessionModel extends Model {
  phase: StartPhase = { kind: 'idle' }
  attempt: StartAttempt | null = null
  /** A start acknowledged after the picker closed only refreshes the list. */
  isPickerPresented = false
  /** The session to open next; the screen navigates and clears it. The session screen loads its real lifecycle. */
  destination: LiveSession | null = null

  private readonly api: RequestPort
  private readonly isCurrent: (context: AcademyContext) => boolean
  private readonly owner: Ownership
  private readonly onStarted: (context: AcademyContext) => Promise<void> | void
  private readonly newKey: () => string

  constructor(deps: {
    api: RequestPort
    isCurrent: (context: AcademyContext) => boolean
    owner: Ownership
    /** Refreshes the live list. */
    onStarted: (context: AcademyContext) => Promise<void> | void
    newKey?: () => string
  }) {
    super()
    this.api = deps.api
    this.isCurrent = deps.isCurrent
    this.owner = deps.owner
    this.onStarted = deps.onStarted
    this.newKey = deps.newKey ?? newKey
  }

  get isStarting() {
    return this.phase.kind === 'starting'
  }

  /** Opens the picker for a new choice; an uncertain attempt stays available for retry. */
  presentPicker() {
    if (this.phase.kind === 'failed') this.phase = { kind: 'idle' }
    this.isPickerPresented = true
    this.changed()
  }

  dismissPicker() {
    this.isPickerPresented = false
    this.changed()
  }

  /** Forgets everything tied to the previous account or academy. */
  reset() {
    this.attempt = null
    this.phase = { kind: 'idle' }
    this.isPickerPresented = false
    this.destination = null
    this.changed()
  }

  /** Starts `schedule`, or retries the unacknowledged start of the same schedule with its key. */
  async start(schedule: StartableSchedule, academyName: string, context: AcademyContext) {
    if (this.isStarting || !this.isCurrent(context)) return
    const previous = this.attempt
    const attempt: StartAttempt =
      previous && sameContext(previous.context, context) && previous.scheduleId === schedule.id
        ? previous
        : { context, academyName, scheduleId: schedule.id, scheduleTitle: schedule.title, key: this.newKey() }
    this.attempt = attempt
    this.phase = { kind: 'starting' }
    this.changed()

    const result = await this.api.post<StartSessionResult>(
      `api/v1/academies/${context.academyId}/sessions`,
      { schedule_id: schedule.id },
      { idempotencyKey: attempt.key },
    )
    // Account or academy changed meanwhile: its retry state was already cleared; touch nothing.
    if (!this.isCurrent(context) || this.attempt !== attempt) return

    if (result.ok) {
      this.attempt = null
      this.phase = { kind: 'idle' }
      this.changed()
      await this.onStarted(context)
      const session = result.value.session
      if (!this.isCurrent(context) || session.academy_id !== context.academyId) return
      if (this.isPickerPresented) {
        this.isPickerPresented = false
        this.destination = { ...session, academy_name: attempt.academyName }
        this.changed()
      }
      return
    }
    const { error } = result
    const title = attempt.scheduleTitle
    switch (error.kind) {
      case 'unauthenticated':
        return this.owner.onUnauthenticated()
      case 'forbidden':
        this.attempt = null
        this.phase = { kind: 'idle' }
        this.isPickerPresented = false
        this.changed()
        return this.owner.onForbidden()
      case 'network':
        this.phase = { kind: 'uncertain', message: `Couldn't confirm whether “${title}” started. Retry: it won't start a second session.` }
        break
      case 'cancelled':
        this.phase = { kind: 'uncertain', message: `The start of “${title}” was interrupted. Retry: it won't start a second session.` }
        break
      default:
        // The key stays with this schedule, so trying it again cannot start twice.
        this.phase = { kind: 'failed', message: readMessage(error) }
    }
    this.changed()
  }
}
