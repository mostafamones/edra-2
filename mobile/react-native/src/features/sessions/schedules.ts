import type { SchedulesPage, StartableSchedule } from './contract.ts'
import type { LoadState } from './live.ts'
import { readMessage } from './outcome.ts'
import { Model, sameContext, type AcademyContext, type APIError, type Ownership, type RequestPort } from './port.ts'

export const SCHEDULES_PAGE_SIZE = 50

/** Schedules the selected academy can start from, searched and paged by the server. */
export class SchedulesModel extends Model {
  state: LoadState = { kind: 'idle' }
  schedules: StartableSchedule[] = []
  /** False when the academy has no open academic year, so nothing can start. */
  hasOpenYear = true
  /** Academy IANA time zone; planned times are wall-clock values in it. */
  timeZone: string | null = null
  isLoadingMore = false
  loadMoreError: string | null = null
  context: AcademyContext | null = null
  query = ''
  private nextOffset: number | null = null
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

  get hasMore() {
    return this.nextOffset !== null
  }

  /** Loads the first page for `context` and `query`, superseding any load in flight. */
  async load(context: AcademyContext, query = '') {
    if (!sameContext(context, this.context)) {
      this.schedules = []
      this.nextOffset = null
    }
    this.context = context
    this.query = query
    const generation = ++this.generation
    this.isLoadingMore = false
    this.loadMoreError = null
    this.state = { kind: 'loading' }
    this.changed()
    const result = await this.fetch(context, query, 0)
    if (generation !== this.generation || !this.isCurrent(context)) return
    if (result.ok) {
      this.schedules = result.value.schedules
      this.nextOffset = result.value.next_offset
      this.hasOpenYear = result.value.academic_year !== null
      this.timeZone = result.value.time_zone
      this.state = { kind: 'loaded' }
      return this.changed()
    }
    return this.fail(result.error, (message) => (this.state = { kind: 'failed', message }))
  }

  /** Appends the next page of the current results. */
  async loadMore() {
    const { context, nextOffset } = this
    if (!context || nextOffset === null || this.isLoadingMore || this.state.kind !== 'loaded') return
    const generation = this.generation
    this.isLoadingMore = true
    this.loadMoreError = null
    this.changed()
    const result = await this.fetch(context, this.query, nextOffset)
    // A newer search or academy owns the list now, including its loading flag.
    if (generation !== this.generation || !this.isCurrent(context)) return
    this.isLoadingMore = false
    if (result.ok) {
      const known = new Set(this.schedules.map((s) => s.id))
      this.schedules = [...this.schedules, ...result.value.schedules.filter((s) => !known.has(s.id))]
      this.nextOffset = result.value.next_offset
      return this.changed()
    }
    return this.fail(result.error, (message) => (this.loadMoreError = message))
  }

  private fetch(context: AcademyContext, query: string, offset: number) {
    let path = `api/v1/academies/${context.academyId}/schedules?limit=${SCHEDULES_PAGE_SIZE}&offset=${offset}`
    const trimmed = query.trim().slice(0, 100)
    if (trimmed) path += `&q=${encodeURIComponent(trimmed)}`
    return this.api.get<SchedulesPage>(path)
  }

  private async fail(error: APIError, show: (message: string) => void) {
    if (error.kind === 'unauthenticated') return this.owner.onUnauthenticated()
    if (error.kind === 'forbidden') {
      this.schedules = []
      this.nextOffset = null
      show('You no longer have access to this academy.')
      this.changed()
      return this.owner.onForbidden()
    }
    if (error.kind === 'cancelled') {
      // A newer search or the picker closing cancelled this load; nothing to report.
      if (this.state.kind === 'loading') this.state = { kind: this.schedules.length ? 'loaded' : 'idle' }
    } else {
      show(readMessage(error))
    }
    this.changed()
  }
}
