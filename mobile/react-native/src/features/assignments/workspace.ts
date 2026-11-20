import { ApiError } from '../../core/api.ts'
import { LatestRequest, type AcademyContext } from '../../core/ownership.ts'
import { createCommand, writeOutcome, type WriteCommand } from '../../core/write.ts'
import {
  NO_ACTIONS,
  announceBody,
  decodeAnnounceFailures,
  decodeAnnounceResult,
  decodeDetail,
  decodeResolution,
  decodeStudentsPage,
  type Actions,
  type AssignmentDetail,
  type AssignmentSummary,
  type StudentWork,
  type StudentsPage,
} from './api.ts'
import { failureMessage, type AssignmentsModel } from './assignments.ts'
import { ACCESS_LOST_MESSAGE, Observable, type AssignmentsEnvironment } from './environment.ts'
import { MarkingModel, type Mode } from './marking.ts'
import { ScanFilter } from './scan.ts'

/** Server filter values (the chip titles are the UI's). */
export type Filter = 'all' | 'not_received' | 'needs_marking' | 'marked' | 'unpublished'
export const FILTERS: ReadonlyArray<Readonly<{ value: Filter; title: string }>> = [
  { value: 'all', title: 'All' },
  { value: 'not_received', title: 'Not received' },
  { value: 'needs_marking', title: 'Needs marking' },
  { value: 'marked', title: 'Marked' },
  { value: 'unpublished', title: 'Unannounced' },
]

/**
 * Row order. The server pages by name; any other order needs the whole list, so it is fetched in one
 * request (the server's 1000-row page) and offered only when the cohort fits in it.
 */
export type Sort = 'name' | 'group'
export const SORTS: ReadonlyArray<Readonly<{ value: Sort; title: string }>> = [
  { value: 'name', title: 'Name' },
  { value: 'group', title: 'Group' },
]
const FULL_LIST_LIMIT = 1000

/** Group order (no group last), keeping the server's name order within a group. */
export function byGroup(students: readonly StudentWork[]): StudentWork[] {
  const key = (s: StudentWork) => s.groupName ?? '\uffff'
  return [...students].sort((a, b) => key(a).localeCompare(key(b)))
}

export type ListState = Readonly<{ status: 'loading' } | { status: 'loaded' } | { status: 'failed'; message: string }>

/** Where the marking sheet was opened from, which decides what follows an acknowledged save. */
export type Origin = 'row' | 'code' | 'camera'

export type AnnounceState =
  | Readonly<{ status: 'reviewing' }>
  | Readonly<{ status: 'sending' }>
  | Readonly<{ status: 'uncertain'; message: string }>
  /** Nothing was announced; `reasons` maps record id → why it was rejected. */
  | Readonly<{ status: 'rejected'; message: string; reasons: Readonly<Record<string, string>> }>
  | Readonly<{ status: 'failed'; message: string }>

/** One announcement command. Its key and reviewed versions are fixed and reused on every retry. */
export type Announcement = Readonly<{
  id: string
  students: readonly StudentWork[]
  state: AnnounceState
  /** One selected student sent without a review; the sheet appears only for an outcome to act on. */
  direct: boolean
  command: WriteCommand<ReturnType<typeof announceBody>>
}>

const REJECTION_REASONS: Readonly<Record<string, string>> = {
  stale: 'Changed since you reviewed it',
  incomplete: 'Not fully marked',
  not_recipient: 'No longer on this assignment',
}

function lookupMessage(code: string, entered: string, message: string): string {
  switch (code) {
    case 'STUDENT_CODE_NOT_FOUND': return `No student has code ${entered}.`
    case 'STUDENT_CODE_RETIRED': return `Code ${entered} is no longer active.`
    case 'STUDENT_CODE_AMBIGUOUS': return `Code ${entered} belongs to more than one student. Choose the student by name.`
    case 'NOT_A_RECIPIENT': return "This student isn't on this assignment."
    case 'STUDENT_CODES_DISABLED': return 'Student codes are off for this academy.'
    case 'INVALID_REQUEST': return `${entered} isn't a valid student code.`
    default: return message
  }
}

/** Unreserved characters only, so `&`, `=`, `+`, `#` and `!'()*` in search text stay literal. */
const queryValue = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
const prefix = (s: string, n: number) => Array.from(s).slice(0, n).join('')

/**
 * One assignment's workspace: structure, the server-searched student list, the marking sheet and
 * announcement. Owned by one academy context; anything answering for another is dropped.
 */
export class WorkspaceModel extends Observable {
  static readonly pageSize = 50

  readonly summary: AssignmentSummary
  readonly context: AcademyContext
  private _detail: AssignmentDetail | null = null
  private _state: ListState = { status: 'loading' }
  private _students: readonly StudentWork[] = []
  private _total = 0
  private _listState: ListState = { status: 'loading' }
  private _isLoadingMore = false
  private _loadMoreError: string | null = null
  private _filter: Filter = 'all'
  private _sort: Sort = 'name'
  private _search = ''
  private _isSelecting = false
  private _selection: ReadonlySet<string> = new Set()
  private _marking: MarkingModel | null = null
  private _origin: Origin = 'row'
  private _nextStudentRequest = 0
  private _isLookingUp = false
  private _lookupError: string | null = null
  private _announcement: Announcement | null = null
  private _notice: string | null = null

  /** Run defaults kept within this assignment: part and entry mode. */
  private runPartId: string | null = null
  private runMode: Mode = 'byQuestion'
  /** Loaded chips (without search), so switching back doesn't refetch. */
  private chips = new Map<Filter, { students: readonly StudentWork[]; total: number }>()
  private readonly detailSlot = new LatestRequest()
  private readonly listSlot = new LatestRequest()
  private readonly lookupSlot = new LatestRequest()

  /** Owned here so a handled code stays suppressed when the camera is recreated. */
  readonly scan = new ScanFilter()
  private readonly parent: AssignmentsModel
  private get env(): AssignmentsEnvironment { return this.parent.env }

  constructor(summary: AssignmentSummary, context: AcademyContext, parent: AssignmentsModel) {
    super()
    this.summary = summary
    this.context = context
    this.parent = parent
  }

  get detail(): AssignmentDetail | null { return this._detail }
  get state(): ListState { return this._state }
  get students(): readonly StudentWork[] { return this._sort === 'group' ? byGroup(this._students) : this._students }
  get total(): number { return this._total }
  get listState(): ListState { return this._listState }
  get isLoadingMore(): boolean { return this._isLoadingMore }
  get loadMoreError(): string | null { return this._loadMoreError }
  get filter(): Filter { return this._filter }
  get sort(): Sort { return this._sort }
  /** Orders other than name need the whole list in one page. */
  get canSortFully(): boolean { return this._total <= FULL_LIST_LIMIT }
  get search(): string { return this._search }
  get isSelecting(): boolean { return this._isSelecting }
  get selection(): ReadonlySet<string> { return this._selection }
  get marking(): MarkingModel | null { return this._marking }
  get origin(): Origin { return this._origin }
  /** Increases after a code-entry sheet closes so the code field can take focus again. */
  get nextStudentRequest(): number { return this._nextStudentRequest }
  get isLookingUp(): boolean { return this._isLookingUp }
  get lookupError(): string | null { return this._lookupError }
  get announcement(): Announcement | null { return this._announcement }
  get notice(): string | null { return this._notice }

  get actions(): Actions { return this._detail?.actions ?? NO_ACTIONS }
  get hasMore(): boolean { return this._students.length < this._total }
  /** Code entry and the camera are offered only when marking is permitted and the academy issues codes. */
  get scanAvailable(): boolean { return this.actions.mark && this._detail?.studentCodesEnabled === true }
  /** Camera recognition pauses while a lookup or sheet is open. */
  get scanPaused(): boolean { return this._marking !== null || this._isLookingUp }

  private get isCurrent(): boolean { return this.env.isCurrent(this.context) }

  dismissLookupError(): void { this.set(() => (this._lookupError = null)) }
  dismissNotice(): void { this.set(() => (this._notice = null)) }

  // MARK: - Loading

  async load(): Promise<void> {
    const ticket = this.detailSlot.begin()
    if (this._detail === null) this.set(() => (this._state = { status: 'loading' }))
    let detail: AssignmentDetail
    try {
      detail = await this.env.api.get(`api/v1/assignments/${encodeURIComponent(this.summary.id)}`, {
        signal: ticket.signal,
        structuredErrors: true,
        decode: decodeDetail,
      })
    } catch (error) {
      if (!ticket.isCurrent() || !this.isCurrent) return
      const hadDetail = this._detail !== null
      await this.fail(error, (message) => (hadDetail ? (this._notice = message) : (this._state = { status: 'failed', message })))
      this.changed()
      return
    }
    if (!ticket.isCurrent() || !this.isCurrent) return
    this._detail = detail
    this._state = { status: 'loaded' }
    this.changed()
    await this.reloadStudents()
  }

  /** Each chip is fetched the first time it's chosen, then reused until the data changes. */
  async setFilter(filter: Filter): Promise<void> {
    if (filter === this._filter) return
    if (this._search === '' && this._listState.status === 'loaded') this.chips.set(this._filter, { students: this._students, total: this._total })
    this._filter = filter
    const cached = this._search === '' ? this.chips.get(filter) : undefined
    if (cached) {
      this.listSlot.begin() // drops any page still loading for the previous chip
      this._selection = new Set()
      this._isLoadingMore = false
      this._loadMoreError = null
      this._students = cached.students
      this._total = cached.total
      this._listState = { status: 'loaded' }
      this.changed()
      return
    }
    await this.fetchFirstPage()
  }

  /** Chips were cached for the old order's paging, so they are dropped. */
  async setSort(sort: Sort): Promise<void> {
    if (sort === this._sort || (sort !== 'name' && !this.canSortFully)) return
    this._sort = sort
    await this.reloadStudents()
  }

  /** Server search across the cohort; resets paging and selection. The screen debounces typing. */
  async setSearch(text: string): Promise<void> {
    const trimmed = text.trim()
    if (trimmed === this._search) return
    this._search = trimmed
    await this.fetchFirstPage()
  }

  /** Fresh data: forget every cached chip, then load the current one. */
  async reloadStudents(): Promise<void> {
    this.chips.clear()
    await this.fetchFirstPage()
  }

  /** Back in the foreground: refresh unless a marking sheet is open. */
  async resumed(): Promise<void> {
    if (this._marking === null) await this.reloadStudents()
  }

  /** First page for the current filter and search. Selection never survives a different list. */
  private async fetchFirstPage(): Promise<void> {
    const ticket = this.listSlot.begin()
    this._selection = new Set()
    this._isLoadingMore = false
    this._loadMoreError = null
    this._listState = { status: 'loading' }
    this.changed()
    const result = await this.fetchPage(0, ticket.signal)
    if (!ticket.isCurrent() || !this.isCurrent) return
    if ('page' in result) {
      this._students = result.page.students
      this._total = result.page.total
      // A larger list than one page can't be ordered honestly; the rows stay in the server's name order.
      if (!this.canSortFully) this._sort = 'name'
      this._listState = { status: 'loaded' }
    } else {
      await this.fail(result.error, (message) => (this._listState = { status: 'failed', message }))
    }
    this.changed()
  }

  async loadMore(): Promise<void> {
    if (!this.hasMore || this._isLoadingMore || this._listState.status !== 'loaded') return
    const ticket = this.listSlot.begin()
    this.set(() => {
      this._isLoadingMore = true
      this._loadMoreError = null
    })
    const result = await this.fetchPage(this._students.length, ticket.signal)
    if (!ticket.isCurrent() || !this.isCurrent) return
    this._isLoadingMore = false
    if ('page' in result) {
      const known = new Set(this._students.map((s) => s.id))
      this._students = [...this._students, ...result.page.students.filter((s) => !known.has(s.id))]
      this._total = result.page.total
    } else {
      await this.fail(result.error, (message) => (this._loadMoreError = message))
    }
    this.changed()
  }

  private async fetchPage(offset: number, signal: AbortSignal): Promise<{ page: StudentsPage } | { error: unknown }> {
    let path = `api/v1/assignments/${encodeURIComponent(this.summary.id)}/marks?filter=${this._filter}&limit=${this._sort === 'name' ? WorkspaceModel.pageSize : FULL_LIST_LIMIT}&offset=${offset}`
    if (this._search !== '') path += `&search=${queryValue(prefix(this._search, 100))}`
    try {
      return { page: await this.env.api.get(path, { signal, structuredErrors: true, decode: decodeStudentsPage }) }
    } catch (error) {
      return { error }
    }
  }

  private async fail(error: unknown, show: (message: string) => void): Promise<void> {
    if (error instanceof ApiError && error.kind === 'cancelled') {
      if (this._listState.status === 'loading') this._listState = { status: 'loaded' }
      if (this._state.status === 'loading' && this._detail !== null) this._state = { status: 'loaded' }
      this._isLoadingMore = false
      return
    }
    const message = await failureMessage(this.env, error, (code, text) =>
      code === 'NOT_FOUND' ? 'This assignment is no longer available.' : text,
    )
    if (message !== null) show(message)
  }

  /** Closes the workspace: outstanding loads can no longer commit and the draft is dropped. */
  cancel(): void {
    this.detailSlot.cancel()
    this.listSlot.cancel()
    this.lookupSlot.cancel()
    if (this._marking && this.parent.activeMarking === this._marking) this.parent.activeMarking = null
  }

  // MARK: - Selection

  setSelecting(on: boolean): void {
    if (this._announcement?.state.status === 'sending') return
    this.set(() => {
      this._isSelecting = on
      if (!on) this._selection = new Set()
    })
  }

  /** Tapping a row while selecting: deselect, or select only an announceable row. Fixed while announcing. */
  toggleSelected(student: StudentWork): void {
    if (this._announcement?.state.status === 'sending') return
    const next = new Set(this._selection)
    if (next.has(student.id)) next.delete(student.id)
    else if (this.announceBlocker(student) === null) next.add(student.id)
    else return
    this.set(() => (this._selection = next))
  }

  /** A long press on a row: start selecting with that row when it can be announced. Never announces. */
  startSelecting(student: StudentWork): void {
    this.set(() => {
      this._isSelecting = true
      if (this.announceBlocker(student) === null) this._selection = new Set([...this._selection, student.id])
    })
  }

  // MARK: - Marking

  open(student: StudentWork, origin: Origin): void {
    const detail = this._detail
    if (!detail || this._marking !== null || !this.isCurrent) return
    this._origin = origin
    const model = new MarkingModel(
      this.env,
      {
        onDefaults: (partId, mode) => {
          this.runPartId = partId
          this.runMode = mode
        },
        onSaved: (saved) => this.saved(saved),
      },
      detail,
      student,
      this.context,
      this.runPartId,
      this.runMode,
    )
    this._marking = model
    this.parent.activeMarking = model
    this.changed()
  }

  /** Closes the sheet without saving (the leave guard already asked). */
  closeMarking(): void {
    if (this.parent.activeMarking === this._marking) this.parent.activeMarking = null
    this._marking = null
    // A code run is ready for the next student once the sheet is gone.
    if (this._origin === 'code') this._nextStudentRequest += 1
    this.changed()
  }

  /** Acknowledged save: update the row. The sheet stays open; closing it ends the student. */
  private saved(student: StudentWork): void {
    this._students = this._students.map((s) => (s.id === student.id ? student : s))
    // The save may move the student between chips; other chips reload when next chosen.
    this.chips.clear()
    this.changed()
  }

  /**
   * Typed or scanned code: the server resolves it among this assignment's students. Writes nothing.
   * Returns false when the code was refused (the reason is in `lookupError`).
   */
  async lookUp(raw: string, origin: Origin): Promise<boolean> {
    const code = raw.trim()
    if (code === '' || this._detail?.studentCodesEnabled !== true || this._marking !== null || this._isLookingUp) return false
    const ticket = this.lookupSlot.begin()
    this.set(() => {
      this._isLookingUp = true
      this._lookupError = null
    })
    try {
      const student = await this.env.api.post(
        `api/v1/assignments/${encodeURIComponent(this.summary.id)}/student-resolution`,
        { student_id: prefix(code, 40) },
        null,
        { signal: ticket.signal, structuredErrors: true, decode: decodeResolution },
      )
      if (!ticket.isCurrent()) return false
      this._isLookingUp = false
      if (!this.isCurrent) return false
      this.open(student, origin)
      this.changed()
      return true
    } catch (error) {
      if (!ticket.isCurrent()) return false
      this._isLookingUp = false
      if (!this.isCurrent) return false
      const kind = error instanceof ApiError ? error.kind : 'network'
      if (kind === 'network') this._lookupError = "Can't reach the server. Try the code again."
      else if (kind !== 'cancelled') {
        this._lookupError = await failureMessage(this.env, error, (failureCode, message) => lookupMessage(failureCode, code, message))
      }
      this.changed()
      return false
    }
  }

  /** Camera frames (every code currently visible): looks up at most one newly visible code. */
  scanned(codes: readonly string[]): Promise<boolean> | null {
    const code = this.scan.recognized(codes, this.scanPaused)
    if (code === null) return null
    this.env.feedback?.('recognized')
    return this.lookUp(code, 'camera').then((opened) => {
      if (!opened && this._lookupError !== null) this.env.feedback?.('failure')
      return opened
    })
  }

  // MARK: - Announcement

  /** Why a loaded student's result can't be announced now, or null when it can. */
  announceBlocker(student: StudentWork): string | null {
    if (!this.actions.announce) return "Announcing isn't available for this assignment."
    if (student.marking !== 'complete') return 'Not fully marked'
    if (student.publicationState === 'published') return 'Already announced'
    if (this._marking?.student.id === student.id && this._marking.hasChanges) return 'Has unsaved changes'
    return null
  }

  /** Opens the review for a set of rows; announcing still needs `announce()`. */
  reviewAnnouncement(students: readonly StudentWork[], direct = false): void {
    if (students.length === 0) return
    const command = createCommand(announceBody(students), this.env.newKey)
    this.set(() => (this._announcement = { id: command.key, students, state: { status: 'reviewing' }, command, direct }))
  }

  /**
   * The explicit announce action. One eligible student is sent at once; several are reviewed first.
   * While a command is open (sending, or its outcome shown) repeat taps start nothing new.
   */
  async reviewSelection(): Promise<void> {
    if (this._announcement !== null) return
    const students = this.students.filter((s) => this._selection.has(s.id))
    const only = students.length === 1 ? students[0]! : null
    if (only === null || this.announceBlocker(only) !== null) return this.reviewAnnouncement(students)
    this.reviewAnnouncement(students, true)
    await this.announce()
  }

  closeAnnouncement(): void {
    this.set(() => (this._announcement = null))
  }

  /** Announces every reviewed student or none. Retries reuse the confirmation's key and versions. */
  async announce(): Promise<void> {
    const current = this._announcement
    if (!current || current.state.status === 'sending' || current.students.some((s) => this.announceBlocker(s) !== null)) return
    const update = (state: AnnounceState) => {
      if (this._announcement?.id !== current.id) return
      this._announcement = { ...this._announcement, state }
      this.changed()
    }
    update({ status: 'sending' })
    try {
      await this.env.api.post(
        `api/v1/assignments/${encodeURIComponent(this.summary.id)}/results/publications`,
        current.command.body,
        current.command.key,
        { structuredErrors: true, decode: decodeAnnounceResult },
      )
    } catch (error) {
      if (!this.isCurrent) return
      const outcome = writeOutcome(error)
      switch (outcome.kind) {
        case 'unauthenticated':
          // Keep the confirmation: after signing in again, Retry replays the same key.
          update({ status: 'uncertain', message: "Couldn't confirm the announcement. Retry: it won't announce twice." })
          await this.env.onUnauthenticated()
          return
        case 'forbidden':
          update({ status: 'failed', message: ACCESS_LOST_MESSAGE })
          await this.env.onForbidden()
          return
        case 'rejected': {
          const { failure } = outcome
          if (failure.code !== 'PUBLICATION_REJECTED') return update({ status: 'failed', message: failure.message })
          let failures: Array<{ id: string; reason: string }> = []
          try {
            failures = decodeAnnounceFailures(failure.details)
          } catch {}
          const reasons = Object.fromEntries(failures.map((f) => [f.id, REJECTION_REASONS[f.reason] ?? "Can't be announced"]))
          this.env.feedback?.('failure')
          update({ status: 'rejected', message: 'Nothing was announced. Review the refreshed list and try again.', reasons })
          await this.reloadStudents()
          return
        }
        default: {
          const server = outcome.kind === 'uncertain' && outcome.failure !== null
          if (!server) this.env.feedback?.('warning')
          update({
            status: 'uncertain',
            message: server
              ? "The server couldn't confirm the announcement. Retry: it won't announce twice."
              : "Couldn't confirm the announcement. Retry: it won't announce twice.",
          })
          return
        }
      }
    }
    if (!this.isCurrent || this._announcement?.id !== current.id) return
    const count = current.students.length
    this.env.feedback?.('success')
    this._announcement = null
    this._isSelecting = false
    this._selection = new Set()
    this._notice = count === 1 ? 'Result announced.' : `${count} results announced.`
    this.changed()
    await this.reloadStudents()
  }

  private set(mutate: () => void): void {
    mutate()
    this.changed()
  }
}
