import { ApiError } from '../../core/api.ts'
import { LatestRequest, type AcademyContext } from '../../core/ownership.ts'
import { failureMessage } from '../assignments/assignments.ts'
import { Observable } from '../assignments/environment.ts'
import {
  decodeAssessmentPage, decodeAttendancePage, decodeDetail,
  type AssessmentItem, type AssessmentKind, type AttendanceItem, type AttendancePage, type StudentDetail,
} from './api.ts'
import { isUnsupported, type StudentsEnvironment } from './directory.ts'

export type SectionState = Readonly<{ status: 'loading' } | { status: 'loaded' } | { status: 'failed'; message: string }>

/** One paged list with its own request slot, so a failure or retry never touches another section. */
type Paged<T> = { state: SectionState; items: readonly T[]; total: number; isLoadingMore: boolean; loadMoreError: string | null }
const emptyPaged = <T>(): Paged<T> => ({ state: { status: 'loading' }, items: [], total: 0, isLoadingMore: false, loadMoreError: null })

export const NOT_AVAILABLE = "This student record isn't available."
export const UNSUPPORTED = "This server doesn't support student records yet."

/**
 * One annual student record (facts, finalized attendance, assessment history), bound to the academy context and
 * record it was opened for. Each section loads, fails and retries on its own; a result for another context,
 * record or assessment kind is dropped.
 */
export class StudentRecordModel extends Observable {
  static readonly attendancePageSize = 50
  static readonly assessmentPageSize = 25

  readonly recordId: string
  readonly context: AcademyContext
  private readonly env: StudentsEnvironment
  private _detail: StudentDetail | null = null
  private _detailState: SectionState = { status: 'loading' }
  private _attendance: Paged<AttendanceItem> & { summary: Omit<AttendancePage, 'items' | 'total'> | null } = { ...emptyPaged(), summary: null }
  private _kind: AssessmentKind = 'assignment'
  private _assessments = new Map<AssessmentKind, Paged<AssessmentItem>>()
  private readonly detailSlot = new LatestRequest()
  private readonly attendanceSlot = new LatestRequest()
  private readonly assessmentSlot = new LatestRequest()

  constructor(recordId: string, context: AcademyContext, env: StudentsEnvironment) {
    super()
    this.recordId = recordId
    this.context = context
    this.env = env
  }

  get detail(): StudentDetail | null { return this._detail }
  get detailState(): SectionState { return this._detailState }
  get attendance(): Readonly<typeof this._attendance> { return this._attendance }
  get kind(): AssessmentKind { return this._kind }
  get assessments(): Readonly<Paged<AssessmentItem>> { return this._assessments.get(this._kind) ?? emptyPaged() }

  private get base() {
    return `api/v1/academies/${encodeURIComponent(this.context.academyId)}/students/${encodeURIComponent(this.recordId)}`
  }
  private get isCurrent(): boolean { return this.env.isCurrent(this.context) }

  /** Every section; used on open, pull to refresh and return to the foreground. */
  load(): Promise<void> {
    return Promise.all([this.loadDetail(), this.loadAttendance(), this.loadAssessments()]).then(() => {})
  }

  async loadDetail(): Promise<void> {
    const ticket = this.detailSlot.begin()
    if (this._detail === null) this.set(() => (this._detailState = { status: 'loading' }))
    try {
      const detail = await this.env.api.get(this.base, { signal: ticket.signal, structuredErrors: true, decode: decodeDetail })
      if (!ticket.isCurrent() || !this.isCurrent) return
      this.set(() => {
        this._detail = detail
        this._detailState = { status: 'loaded' }
      })
    } catch (error) {
      if (!ticket.isCurrent() || !this.isCurrent) return
      await this.fail(error, (message) => (this._detailState = { status: 'failed', message }))
    }
  }

  /** First attendance page; the summaries always describe the whole history. */
  async loadAttendance(): Promise<void> {
    const ticket = this.attendanceSlot.begin()
    const current = this._attendance
    if (current.state.status !== 'loaded') this.set(() => (this._attendance = { ...current, state: { status: 'loading' } }))
    try {
      const page = await this.env.api.get(`${this.base}/attendance?limit=${StudentRecordModel.attendancePageSize}&offset=0`, {
        signal: ticket.signal, structuredErrors: true, decode: decodeAttendancePage,
      })
      if (!ticket.isCurrent() || !this.isCurrent) return
      const { items, total, ...summary } = page
      this.set(() => (this._attendance = { state: { status: 'loaded' }, items, total, summary, isLoadingMore: false, loadMoreError: null }))
    } catch (error) {
      if (!ticket.isCurrent() || !this.isCurrent) return
      await this.fail(error, (message) => (this._attendance = { ...this._attendance, isLoadingMore: false, state: { status: 'failed', message } }))
    }
  }

  async loadMoreAttendance(): Promise<void> {
    const current = this._attendance
    if (current.state.status !== 'loaded' || current.isLoadingMore || current.items.length >= current.total) return
    const ticket = this.attendanceSlot.begin()
    this.set(() => (this._attendance = { ...current, isLoadingMore: true, loadMoreError: null }))
    try {
      const page = await this.env.api.get(`${this.base}/attendance?limit=${StudentRecordModel.attendancePageSize}&offset=${current.items.length}`, {
        signal: ticket.signal, structuredErrors: true, decode: decodeAttendancePage,
      })
      if (!ticket.isCurrent() || !this.isCurrent) return
      const known = new Set(current.items.map((i) => i.sessionId))
      const { items, total, ...summary } = page
      this.set(() => (this._attendance = {
        ...this._attendance, items: [...current.items, ...items.filter((i) => !known.has(i.sessionId))], total, summary, isLoadingMore: false,
      }))
    } catch (error) {
      if (!ticket.isCurrent() || !this.isCurrent) return
      await this.fail(error, (message) => (this._attendance = { ...this._attendance, isLoadingMore: false, loadMoreError: message }))
    }
  }

  /** Shows another assessment type; each type is filtered on the server before paging and kept once loaded. */
  setKind(kind: AssessmentKind): Promise<void> {
    if (kind === this._kind) return Promise.resolve()
    this.set(() => (this._kind = kind))
    return this._assessments.has(kind) ? Promise.resolve() : this.loadAssessments()
  }

  /** First page of the current type. Other types are dropped so they refetch when chosen (results may have changed). */
  async loadAssessments(): Promise<void> {
    const kind = this._kind
    const ticket = this.assessmentSlot.begin()
    const current = this.assessments
    for (const other of [...this._assessments.keys()]) if (other !== kind) this._assessments.delete(other)
    if (current.state.status !== 'loaded') this.set(() => this._assessments.set(kind, { ...current, state: { status: 'loading' } }))
    try {
      const page = await this.env.api.get(`${this.base}/assessments?kind=${kind}&limit=${StudentRecordModel.assessmentPageSize}&offset=0`, {
        signal: ticket.signal, structuredErrors: true, decode: decodeAssessmentPage,
      })
      if (!ticket.isCurrent() || !this.isCurrent) return
      this.set(() => this._assessments.set(kind, { state: { status: 'loaded' }, items: page.items, total: page.total, isLoadingMore: false, loadMoreError: null }))
    } catch (error) {
      if (!ticket.isCurrent() || !this.isCurrent) return
      await this.fail(error, (message) => this._assessments.set(kind, { ...this.assessments, isLoadingMore: false, state: { status: 'failed', message } }))
    }
  }

  async loadMoreAssessments(): Promise<void> {
    const kind = this._kind
    const current = this.assessments
    if (current.state.status !== 'loaded' || current.isLoadingMore || current.items.length >= current.total) return
    const ticket = this.assessmentSlot.begin()
    this.set(() => this._assessments.set(kind, { ...current, isLoadingMore: true, loadMoreError: null }))
    try {
      const page = await this.env.api.get(`${this.base}/assessments?kind=${kind}&limit=${StudentRecordModel.assessmentPageSize}&offset=${current.items.length}`, {
        signal: ticket.signal, structuredErrors: true, decode: decodeAssessmentPage,
      })
      if (!ticket.isCurrent() || !this.isCurrent || this._kind !== kind) return
      const known = new Set(current.items.map((i) => i.id))
      this.set(() => this._assessments.set(kind, { ...current, items: [...current.items, ...page.items.filter((i) => !known.has(i.id))], total: page.total, isLoadingMore: false }))
    } catch (error) {
      if (!ticket.isCurrent() || !this.isCurrent || this._kind !== kind) return
      await this.fail(error, (message) => this._assessments.set(kind, { ...this.assessments, isLoadingMore: false, loadMoreError: message }))
    }
  }

  /** The screen closed: outstanding loads can no longer commit. */
  cancel(): void {
    this.detailSlot.cancel()
    this.attendanceSlot.cancel()
    this.assessmentSlot.cancel()
  }

  private set(apply: () => void): void {
    apply()
    this.changed()
  }

  private async fail(error: unknown, show: (message: string) => void): Promise<void> {
    if (error instanceof ApiError && error.kind === 'cancelled') return
    const message = isUnsupported(error)
      ? UNSUPPORTED
      : await failureMessage(this.env, error, (code, text) => (code === 'NOT_FOUND' ? NOT_AVAILABLE : text))
    if (message === null || !this.isCurrent) return
    this.set(() => show(message))
  }
}
