import { ApiError, UNCODED_ERROR } from '../../core/api.ts'
import { LatestRequest, type AcademyContext } from '../../core/ownership.ts'
import { failureMessage, sameContext } from '../assignments/assignments.ts'
import { Observable, type AssignmentsEnvironment } from '../assignments/environment.ts'
import { decodeDirectoryPage, type AcademicYear, type DirectoryPage, type StatusFilter, type StudentRow } from './api.ts'

export type StudentsEnvironment = Pick<AssignmentsEnvironment, 'api' | 'isCurrent' | 'onUnauthenticated' | 'onForbidden'>

/**
 * `unsupported`: the server has no student endpoints (an older deployment), which is not an empty directory.
 * `noYear`: the academy has no open academic year.
 */
export type DirectoryState = Readonly<
  { status: 'idle' } | { status: 'loading' } | { status: 'loaded' } | { status: 'noYear' } | { status: 'unsupported' } | { status: 'failed'; message: string }
>

/** A 404 without Edra's error envelope: the route does not exist on this server. */
export const isUnsupported = (error: unknown) =>
  error instanceof ApiError && error.kind === 'rejected' && error.failure?.status === 404 && error.failure.code === UNCODED_ERROR

/** Unreserved characters only, so `&`, `=`, `+` and `#` in search text stay literal. */
const queryValue = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)

/**
 * The Students tab: the academy's open-year records, searched and filtered on the server, in pages. Owned by
 * one academy context; anything answering for an older context, query or filter is dropped.
 */
export class StudentDirectoryModel extends Observable {
  static readonly pageSize = 50

  private _context: AcademyContext | null = null
  private _search = ''
  private _status: StatusFilter = 'active'
  private _state: DirectoryState = { status: 'idle' }
  private _students: readonly StudentRow[] = []
  private _total = 0
  private _year: AcademicYear | null = null
  private _pages = 0
  private _isLoadingMore = false
  private _loadMoreError: string | null = null
  /** A refresh failed while the same context's rows stay on screen. */
  private _refreshError: string | null = null
  private readonly slot = new LatestRequest()
  readonly env: StudentsEnvironment

  constructor(env: StudentsEnvironment) {
    super()
    this.env = env
  }

  get context(): AcademyContext | null { return this._context }
  get search(): string { return this._search }
  get status(): StatusFilter { return this._status }
  get state(): DirectoryState { return this._state }
  get students(): readonly StudentRow[] { return this._students }
  get total(): number { return this._total }
  get year(): AcademicYear | null { return this._year }
  get isLoadingMore(): boolean { return this._isLoadingMore }
  get loadMoreError(): string | null { return this._loadMoreError }
  get refreshError(): string | null { return this._refreshError }
  get hasMore(): boolean { return this._students.length < this._total }

  /** First page for `context`. A different context (A → B → A too) drops everything first. */
  load(context: AcademyContext | null): Promise<void> {
    if (!sameContext(context, this._context)) {
      this._context = context
      this._search = ''
      this._status = 'active'
      this.clear()
    }
    return this.fetchFirstPage()
  }

  /** Revalidation (foreground, pull to refresh): keeps the rows if it fails. */
  refresh(): Promise<void> {
    return this.fetchFirstPage()
  }

  /** Server search; the screen debounces typing. A new query starts a fresh paging sequence. */
  setSearch(text: string): Promise<void> {
    const trimmed = Array.from(text.trim()).slice(0, 100).join('')
    if (trimmed === this._search) return Promise.resolve()
    this._search = trimmed
    this.clearRows()
    return this.fetchFirstPage()
  }

  setStatus(status: StatusFilter): Promise<void> {
    if (status === this._status) return Promise.resolve()
    this._status = status
    this.clearRows()
    return this.fetchFirstPage()
  }

  /** Appends the next page; never overlaps another request, and a stale answer is dropped. */
  async loadMore(): Promise<void> {
    const context = this._context
    if (!context || !this.hasMore || this._isLoadingMore || this._state.status !== 'loaded') return
    const ticket = this.slot.begin()
    this._isLoadingMore = true
    this._loadMoreError = null
    this.changed()
    const result = await this.fetch(context, this._pages, ticket.signal)
    if (!ticket.isCurrent() || !sameContext(this._context, context) || !this.env.isCurrent(context)) return
    this._isLoadingMore = false
    if ('page' in result) {
      this._pages += 1
      const known = new Set(this._students.map((s) => s.id))
      this._students = [...this._students, ...result.page.students.filter((s) => !known.has(s.id))]
      this._total = result.page.total
    } else {
      await this.fail(result.error, (message) => (this._loadMoreError = message))
    }
    this.changed()
  }

  /** The owner went away. */
  cancel(): void {
    this.slot.cancel()
  }

  private async fetchFirstPage(): Promise<void> {
    const context = this._context
    const ticket = this.slot.begin()
    this._isLoadingMore = false
    this._loadMoreError = null
    if (context === null) {
      this.clear()
      this.changed()
      return
    }
    const hadRows = this._state.status === 'loaded'
    if (!hadRows) this._state = { status: 'loading' }
    this.changed()
    const result = await this.fetch(context, 0, ticket.signal)
    if (!ticket.isCurrent() || !sameContext(this._context, context) || !this.env.isCurrent(context)) return
    if ('page' in result) {
      this._refreshError = null
      this._pages = 1
      this._year = result.page.academicYear
      this._students = result.page.students
      this._total = result.page.total
      this._state = result.page.academicYear === null ? { status: 'noYear' } : { status: 'loaded' }
    } else if (isUnsupported(result.error)) {
      this.clearRows()
      this._state = { status: 'unsupported' }
    } else {
      await this.fail(result.error, (message) => {
        if (this._state.status === 'loaded') this._refreshError = message
        else this._state = { status: 'failed', message }
      })
    }
    this.changed()
  }

  private async fetch(context: AcademyContext, page: number, signal: AbortSignal): Promise<{ page: DirectoryPage } | { error: unknown }> {
    let path = `api/v1/academies/${encodeURIComponent(context.academyId)}/students?status=${this._status}&page=${page}&page_size=${StudentDirectoryModel.pageSize}`
    if (this._search !== '') path += `&search=${queryValue(this._search)}`
    try {
      return { page: await this.env.api.get(path, { signal, structuredErrors: true, decode: decodeDirectoryPage }) }
    } catch (error) {
      return { error }
    }
  }

  private async fail(error: unknown, show: (message: string) => void): Promise<void> {
    if (error instanceof ApiError && error.kind === 'cancelled') {
      if (this._state.status === 'loading') this._state = { status: 'idle' }
      this._isLoadingMore = false
      return
    }
    if (error instanceof ApiError && error.kind === 'forbidden') {
      // Membership lost: nothing from this academy stays on screen.
      this.clear()
      await this.env.onForbidden()
      return
    }
    const message = await failureMessage(this.env, error)
    if (message !== null) show(message)
  }

  private clearRows(): void {
    this._students = []
    this._total = 0
    this._pages = 0
    this._refreshError = null
    this._isLoadingMore = false
    this._loadMoreError = null
    if (this._state.status === 'loaded') this._state = { status: 'loading' }
  }

  private clear(): void {
    this.clearRows()
    this._year = null
    this._state = { status: 'idle' }
  }
}
