import { ApiError } from '../../core/api.ts'
import { LatestRequest, type AcademyContext } from '../../core/ownership.ts'
import { decodeAssignmentsPage, type AssignmentSummary, type AssignmentsPage } from './api.ts'
import { ACCESS_LOST_MESSAGE, NETWORK_MESSAGE, Observable, type AssignmentsEnvironment } from './environment.ts'
import type { MarkingModel } from './marking.ts'

export type LoadState = Readonly<{ status: 'idle' } | { status: 'loading' } | { status: 'loaded' } | { status: 'failed'; message: string }>

export const sameContext = (a: AcademyContext | null, b: AcademyContext | null): boolean =>
  a === b || (a !== null && b !== null && a.academyId === b.academyId && a.epoch === b.epoch)

/**
 * Shared failure handling. 401 signs out (the callback is scope-bound); 403 revalidates academies;
 * cancellation is not a failure. Returns the message to show, or null.
 */
export async function failureMessage(
  env: AssignmentsEnvironment,
  error: unknown,
  rejected: (code: string, message: string) => string = (_, message) => message,
): Promise<string | null> {
  const kind = error instanceof ApiError ? error.kind : 'network'
  switch (kind) {
    case 'unauthenticated':
      await env.onUnauthenticated()
      return null
    case 'forbidden':
      await env.onForbidden()
      return ACCESS_LOST_MESSAGE
    case 'network':
      return NETWORK_MESSAGE
    case 'server':
      return (error as ApiError).message
    case 'rejected': {
      const failure = (error as ApiError).failure!
      return rejected(failure.code, failure.message)
    }
    case 'cancelled':
      return null
  }
}

/** The Assessments root: the academy's active and closed assignments, newest first, in offset pages. */
export class AssignmentsModel extends Observable {
  static readonly pageSize = 50

  private _state: LoadState = { status: 'idle' }
  private _assignments: readonly AssignmentSummary[] = []
  private _total = 0
  private _isLoadingMore = false
  private _loadMoreError: string | null = null
  private _context: AcademyContext | null = null
  /** The open marking draft, so a voluntary academy switch can offer Save / Discard first. */
  activeMarking: MarkingModel | null = null
  private readonly slot = new LatestRequest()

  readonly env: AssignmentsEnvironment

  constructor(env: AssignmentsEnvironment) {
    super()
    this.env = env
  }

  get state(): LoadState { return this._state }
  get assignments(): readonly AssignmentSummary[] { return this._assignments }
  get total(): number { return this._total }
  get isLoadingMore(): boolean { return this._isLoadingMore }
  get loadMoreError(): string | null { return this._loadMoreError }
  get context(): AcademyContext | null { return this._context }
  get hasMore(): boolean { return this._assignments.length < this._total }

  /** A voluntary switch to another academy must ask Save / Discard / Keep editing first. */
  get switchNeedsConfirmation(): boolean {
    return this.activeMarking?.hasChanges === true
  }

  /** Discard the open draft before a confirmed switch. */
  discardActiveMarking(): void {
    this.activeMarking?.discard()
    this.activeMarking = null
    this.changed()
  }

  /** Loads the first page for `context`. A different context drops the list and any open draft first. */
  async load(context: AcademyContext | null): Promise<void> {
    if (!sameContext(context, this._context)) {
      this._assignments = []
      this._total = 0
      this.activeMarking = null
    }
    this._context = context
    const ticket = this.slot.begin()
    this._isLoadingMore = false
    this._loadMoreError = null
    if (context === null) {
      this._state = { status: 'idle' }
      this.changed()
      return
    }
    this._state = { status: 'loading' }
    this.changed()
    const result = await this.fetch(context, 0, ticket.signal)
    if (!ticket.isCurrent() || !sameContext(this._context, context) || !this.env.isCurrent(context)) return
    if ('page' in result) {
      this._assignments = result.page.assignments
      this._total = result.page.total
      this._state = { status: 'loaded' }
    } else {
      await this.fail(result.error, (message) => (this._state = { status: 'failed', message }))
    }
    this.changed()
  }

  /** Appends the next page; a partial list is never presented as the whole academy. */
  async loadMore(): Promise<void> {
    const context = this._context
    if (!context || !this.hasMore || this._isLoadingMore || this._state.status !== 'loaded') return
    const ticket = this.slot.begin()
    this._isLoadingMore = true
    this._loadMoreError = null
    this.changed()
    const result = await this.fetch(context, this._assignments.length, ticket.signal)
    if (!ticket.isCurrent() || !this.env.isCurrent(context)) return
    this._isLoadingMore = false
    if ('page' in result) {
      const known = new Set(this._assignments.map((a) => a.id))
      this._assignments = [...this._assignments, ...result.page.assignments.filter((a) => !known.has(a.id))]
      this._total = result.page.total
    } else {
      await this.fail(result.error, (message) => (this._loadMoreError = message))
    }
    this.changed()
  }

  /** The owner went away (screen closed or context changed). */
  cancel(): void {
    this.slot.cancel()
  }

  private async fetch(context: AcademyContext, offset: number, signal: AbortSignal): Promise<{ page: AssignmentsPage } | { error: unknown }> {
    const path = `api/v1/academies/${encodeURIComponent(context.academyId)}/assignments?limit=${AssignmentsModel.pageSize}&offset=${offset}`
    try {
      return { page: await this.env.api.get(path, { signal, decode: decodeAssignmentsPage }) }
    } catch (error) {
      return { error }
    }
  }

  private async fail(error: unknown, show: (message: string) => void): Promise<void> {
    if (error instanceof ApiError && error.kind === 'forbidden') {
      this._assignments = []
      this._total = 0
      this._state = { status: 'idle' }
      await this.env.onForbidden()
      return
    }
    if (error instanceof ApiError && error.kind === 'cancelled') {
      if (this._state.status === 'loading') this._state = { status: this._assignments.length === 0 ? 'idle' : 'loaded' }
      this._isLoadingMore = false
      return
    }
    const message = await failureMessage(this.env, error)
    if (message !== null) show(message)
  }
}
