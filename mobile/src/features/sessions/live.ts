import type { LiveSession, LiveSessionsPage } from './contract.ts'
import { readMessage } from './outcome.ts'
import { Model, sameContext, type AcademyContext, type Ownership, type RequestPort } from './port.ts'

export type LoadState = { kind: 'idle' } | { kind: 'loading' } | { kind: 'loaded' } | { kind: 'failed'; message: string }

/** Live sessions of the selected academy. Only the newest load for the current context commits. */
export class LiveSessionsModel extends Model {
  state: LoadState = { kind: 'idle' }
  sessions: LiveSession[] = []
  context: AcademyContext | null = null
  private generation = 0

  private readonly api: RequestPort
  private readonly isCurrent: (context: AcademyContext) => boolean
  private readonly owner: Ownership

  constructor(deps: { api: RequestPort; isCurrent: (context: AcademyContext) => boolean; owner: Ownership }) {
    super()
    this.api = deps.api
    this.isCurrent = deps.isCurrent
    this.owner = deps.owner
  }

  async load(next: AcademyContext | null) {
    if (!sameContext(next, this.context)) this.sessions = []
    this.context = next
    const generation = ++this.generation
    if (!next) {
      this.state = { kind: 'idle' }
      return this.changed()
    }
    this.state = { kind: 'loading' }
    this.changed()
    const result = await this.api.get<LiveSessionsPage>(`api/v1/academies/${next.academyId}/sessions?state=live`)
    // A stale 401/403 neither signs out nor clears a newer context.
    if (generation !== this.generation || !sameContext(this.context, next) || !this.isCurrent(next)) return

    if (result.ok) {
      this.sessions = result.value.sessions
      this.state = { kind: 'loaded' }
    } else {
      const { error } = result
      if (error.kind === 'unauthenticated') return this.owner.onUnauthenticated()
      if (error.kind === 'forbidden') {
        this.sessions = []
        this.state = { kind: 'idle' }
        this.changed()
        return this.owner.onForbidden()
      }
      this.state = error.kind === 'cancelled'
        ? { kind: this.sessions.length ? 'loaded' : 'idle' }
        : { kind: 'failed', message: readMessage(error) }
    }
    this.changed()
  }
}
