import { ApiError, type ApiFailure } from '../../core/api.ts'
import type { AcademyContext } from '../../core/ownership.ts'
import { createCommand, writeOutcome, type WriteCommand } from '../../core/write.ts'
import {
  decodeConflictCurrent,
  decodeSaveResult,
  isChoiceKind,
  isWrittenWork,
  markFor,
  saveMarksBody,
  takesAnswers,
  takesTotal,
  type AnswerEdit,
  type AssignmentDetail,
  type MarkEdit,
  type Part,
  type Question,
  type StudentWork,
} from './api.ts'
import { Observable, type AssignmentsEnvironment } from './environment.ts'
import { displayScore, formatScore, hundredths } from './score.ts'

export type Mode = 'byQuestion' | 'fast'
export const MODE_TITLES: Readonly<Record<Mode, string>> = { byQuestion: 'By question', fast: 'Fast mark' }

export type Entry =
  | Readonly<{ kind: 'notEntered' }>
  /** choiceId null: Blank (recorded as unanswered). */
  | Readonly<{ kind: 'choice'; choiceId: string | null }>
  | Readonly<{ kind: 'score'; text: string }>

export const NOT_ENTERED: Entry = Object.freeze({ kind: 'notEntered' })

export type Total = Readonly<{ text: string; excused: boolean; reason: string }>
export const EMPTY_TOTAL: Total = Object.freeze({ text: '', excused: false, reason: '' })

export type SaveState =
  | Readonly<{ status: 'idle' }>
  | Readonly<{ status: 'saving' }>
  /** The outcome is unknown; Retry resends the same key and payload. */
  | Readonly<{ status: 'uncertain'; message: string }>
  /** Someone else saved first. Attempted inputs stay in the draft; `current` is the server's work. */
  | Readonly<{ status: 'conflict'; current: StudentWork }>
  | Readonly<{ status: 'failed'; message: string }>

export type Quick = 'zero' | 'half' | 'full'

export type MarkingHooks = Readonly<{
  /** The run defaults (part, chosen mode) changed; the workspace keeps them for the next student. */
  onDefaults: (partId: string, mode: Mode) => void
  /** An acknowledged save. */
  onSaved: (student: StudentWork) => void
}>

type Edit = { mark: MarkEdit } | { answer: AnswerEdit }
type SaveBody = ReturnType<typeof saveMarksBody>

const trimSpaces = (s: string) => s.replace(/^[\p{Zs}\t]+|[\p{Zs}\t]+$/gu, '')
const trimAll = (s: string) => s.trim()
/** Swift `prefix(n)` counts characters; code points are close enough for limits the server re-checks. */
const prefix = (s: string, n: number) => Array.from(s).slice(0, n).join('')

function sameEntry(a: Entry, b: Entry): boolean {
  if (a.kind === 'score' && b.kind === 'score') {
    const x = hundredths(a.text)
    return x !== null && x === hundredths(b.text)
  }
  if (a.kind === 'choice' && b.kind === 'choice') return a.choiceId === b.choiceId
  return a.kind === b.kind
}

function sameTotal(a: Total, b: Total): boolean {
  const x = trimSpaces(a.text)
  const y = trimSpaces(b.text)
  const sameScore = x === y || (hundredths(x) !== null && hundredths(x) === hundredths(y))
  return sameScore && a.excused === b.excused && (!a.excused || trimAll(a.reason) === b.reason)
}

function modesOf(part: Part): Mode[] {
  return [...(takesAnswers(part) ? (['byQuestion'] as const) : []), ...(takesTotal(part) ? (['fast'] as const) : [])]
}

function rejectionMessage(failure: ApiFailure): string {
  switch (failure.code) {
    case 'ASSIGNMENT_CLOSED': return 'This assignment is closed. Only work already received can be marked.'
    case 'ASSIGNMENT_NOT_OPEN': return "This assignment can't be marked now."
    case 'YEAR_CLOSED': return 'This academic year is closed. Marks are read-only.'
    case 'INVALID_SCORE': return 'A mark is above its maximum or has more than two decimals.'
    case 'UNKNOWN_PART': return 'The assignment changed. Close and open it again.'
    case 'NOT_A_RECIPIENT': return "This student isn't on this assignment."
    case 'IDEMPOTENCY_CONFLICT': return "This save didn't match its earlier attempt. Save again."
    default: return failure.message
  }
}

/**
 * One student's marking draft: per-question entries or fast part totals, feedback, and the save.
 * Scoring stays on the server; this only shapes inputs, validates format/maxima and owns the request.
 */
export class MarkingModel extends Observable {
  static readonly pageSize = 5

  readonly assignment: AssignmentDetail
  readonly context: AcademyContext
  private _student: StudentWork
  private _partId: string
  private _mode: Mode
  /** The mode the instructor chose for this run; a part's saved representation may be shown instead. */
  private runMode: Mode
  private _questionIndex = 0
  private entries = new Map<string, Entry>()
  private totals = new Map<string, Total>()
  private _feedback: string
  private _saveState: SaveState = { status: 'idle' }

  /** The part representation the instructor edited; parts not listed are left as saved. */
  private edited = new Map<string, Mode>()
  private baseEntries = new Map<string, Entry>()
  private baseTotals = new Map<string, Total>()
  private baseFeedback = ''
  /** The unacknowledged request, retried unchanged until the server answers. */
  private pending: WriteCommand<SaveBody> | null = null

  private readonly env: AssignmentsEnvironment
  private readonly hooks: MarkingHooks

  constructor(
    env: AssignmentsEnvironment,
    hooks: MarkingHooks,
    assignment: AssignmentDetail,
    student: StudentWork,
    context: AcademyContext,
    partId: string | null,
    mode: Mode,
  ) {
    super()
    this.env = env
    this.hooks = hooks
    this.assignment = assignment
    this.context = context
    this._student = student
    const first = assignment.parts[0]?.id ?? ''
    this._partId = partId !== null && assignment.parts.some((p) => p.id === partId) ? partId : first
    this.runMode = mode
    this._feedback = student.feedback
    this.rebase(student, false)
    this._mode = this.shownMode(this._partId, mode)
  }

  // MARK: - Structure

  get student(): StudentWork { return this._student }
  get partId(): string { return this._partId }
  get mode(): Mode { return this._mode }
  get questionIndex(): number { return this._questionIndex }
  get feedback(): string { return this._feedback }
  get saveState(): SaveState { return this._saveState }

  get part(): Part | undefined { return this.assignment.parts.find((p) => p.id === this._partId) }
  get isConflict(): boolean { return this._saveState.status === 'conflict' }
  get isSaving(): boolean { return this._saveState.status === 'saving' }
  get isUncertain(): boolean { return this._saveState.status === 'uncertain' }
  get canEdit(): boolean { return this.assignment.actions.mark && this.pending === null && !this.isConflict }

  /** Modes the selected part supports. */
  get modes(): Mode[] {
    const part = this.part
    return part ? modesOf(part) : []
  }

  get questions(): readonly Question[] { return this.part?.questions ?? [] }
  get page(): number { return Math.floor(this._questionIndex / MarkingModel.pageSize) }
  get pageCount(): number { return Math.max(1, Math.ceil(this.questions.length / MarkingModel.pageSize)) }
  get pageQuestions(): readonly Question[] {
    const start = this.page * MarkingModel.pageSize
    return this.questions.slice(start, start + MarkingModel.pageSize)
  }
  get currentQuestion(): Question | undefined { return this.questions[this._questionIndex] }

  selectPart(id: string): void {
    if (id === this._partId || !this.assignment.parts.some((p) => p.id === id)) return
    this._partId = id
    this._questionIndex = 0
    this._mode = this.shownMode(id, this.runMode)
    this.hooks.onDefaults(this._partId, this.runMode)
    this.changed()
  }

  /** Changing modes never changes saved work; only edits in a mode do. */
  selectMode(mode: Mode): void {
    if (!this.modes.includes(mode)) return
    this._mode = mode
    this.runMode = mode
    this.hooks.onDefaults(this._partId, this.runMode)
    this.changed()
  }

  goToQuestion(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.questions.length) return
    this._questionIndex = index
    this.changed()
  }

  goToPage(page: number): void {
    this.goToQuestion(page * MarkingModel.pageSize)
  }

  /** The saved representation wins over the run default, so existing work is shown as saved. */
  private shownMode(partId: string, preferred: Mode): Mode {
    const part = this.assignment.parts.find((p) => p.id === partId)
    if (!part) return preferred
    const available = modesOf(part)
    const saved = markFor(this._student, partId)
    if (saved && available.includes(saved.fromAnswers ? 'byQuestion' : 'fast')) return saved.fromAnswers ? 'byQuestion' : 'fast'
    return available.includes(preferred) ? preferred : (available[0] ?? preferred)
  }

  // MARK: - Entry

  entry(questionId: string): Entry {
    return this.entries.get(questionId) ?? NOT_ENTERED
  }

  setEntry(questionId: string, value: Entry): void {
    if (!this.canEdit || !this.questions.some((q) => q.id === questionId)) return
    this.entries.set(questionId, value)
    this.startEditing(this._partId, 'byQuestion')
    this.changed()
  }

  /** What a shortcut would enter: the current Written Work question, or the part total in Fast mark. */
  quickValue(quick: Quick): string | null {
    const limit = hundredths(this._mode === 'fast' ? (this.part?.maxScore ?? '') : (this.currentQuestion?.maxScore ?? ''))
    if (limit === null) return null
    if (quick === 'zero') return '0'
    if (quick === 'full') return formatScore(limit)
    // Half only when the maximum divides exactly into hundredths.
    return limit % 2 === 0 ? formatScore(limit / 2) : null
  }

  /** Shortcut entry: it changes the current question (or total) and never moves. */
  applyQuick(quick: Quick): void {
    const value = this.quickValue(quick)
    if (value === null) return
    if (this._mode === 'fast') this.setTotal({ ...this.total, text: value })
    else if (this.currentQuestion) this.setEntry(this.currentQuestion.id, { kind: 'score', text: value })
  }

  clearCurrent(): void {
    if (this.currentQuestion) this.setEntry(this.currentQuestion.id, NOT_ENTERED)
  }

  get total(): Total {
    return this.totals.get(this._partId) ?? EMPTY_TOTAL
  }

  setTotal(value: Total): void {
    if (!this.canEdit) return
    this.totals.set(this._partId, value)
    this.startEditing(this._partId, 'fast')
    this.changed()
  }

  setFeedback(text: string): void {
    if (text === this._feedback) return
    this._feedback = text
    this.clearFailure()
    this.changed()
  }

  /** One representation per part: editing one returns the other's draft to its saved state. */
  private startEditing(partId: string, mode: Mode): void {
    this.clearFailure()
    this.edited.set(partId, mode)
    const part = this.assignment.parts.find((p) => p.id === partId)
    if (!part) return
    if (mode === 'byQuestion') {
      restore(this.totals, this.baseTotals, partId)
    } else {
      for (const question of part.questions) restore(this.entries, this.baseEntries, question.id)
    }
  }

  private clearFailure(): void {
    if (this._saveState.status === 'failed') this._saveState = { status: 'idle' }
  }

  // MARK: - Progress

  get enteredCount(): number {
    return this.questions.filter((q) => this.entry(q.id).kind !== 'notEntered').length
  }

  /** Draft Written Work total of the selected part; choice parts are scored by the server. */
  get draftWrittenTotal(): string | null {
    if (!isWrittenWork(this.part)) return null
    let sum = 0
    for (const question of this.questions) {
      const entry = this.entry(question.id)
      if (entry.kind !== 'score') continue
      const value = hundredths(entry.text)
      if (value === null) return null
      sum += value
    }
    return formatScore(sum)
  }

  get savedPartScore(): string | null {
    const mark = markFor(this._student, this._partId)
    return mark ? displayScore(mark.score) : null
  }

  // MARK: - Changes and validation

  get hasChanges(): boolean {
    return this._feedback !== this.baseFeedback || this.assignment.parts.some((p) => this.edits(p)?.length !== 0)
  }

  /** Titles of parts whose saved representation this save replaces (fast ↔ question entry). */
  get replacements(): string[] {
    return this.assignment.parts.flatMap((part) => {
      const mode = this.edited.get(part.id)
      const edits = this.edits(part)
      if (mode === undefined || edits === null || edits.length === 0) return []
      const saved = markFor(this._student, part.id)
      const hasAnswers = this._student.answers.some((a) => a.partId === part.id)
      const replaces = mode === 'byQuestion' ? saved !== undefined && !saved.fromAnswers : hasAnswers
      return replaces ? [part.title] : []
    })
  }

  /** Format/maximum problems shown before saving; the server checks everything again. */
  get problems(): string[] {
    return this.assignment.parts.filter((p) => this.edited.has(p.id) && this.edits(p) === null).map((p) => this.problem(p))
  }

  get canSave(): boolean {
    return this.canEdit && this.hasChanges && this.problems.length === 0 && !this.isSaving
  }

  /** Save, or Retry while uncertain. */
  get canRequestSave(): boolean {
    return this.canSave || this.isUncertain
  }

  /** Saving must first confirm replacing marks entered the other way (`replacements`). */
  get needsReplaceConfirmation(): boolean {
    return !this.isUncertain && this.replacements.length > 0
  }

  /** Closing asks Save / Discard / Keep editing. */
  get needsLeaveConfirmation(): boolean {
    return this.hasChanges || this.isUncertain
  }

  /** Swipe-to-dismiss is allowed. */
  get canDismiss(): boolean {
    return !(this.hasChanges || this.isSaving || this.isUncertain)
  }

  private problem(part: Part): string {
    if (this.edited.get(part.id) === 'fast') {
      const total = this.totals.get(part.id) ?? EMPTY_TOTAL
      if (total.excused && trimAll(total.reason) === '') return `${part.title}: enter the excused reason.`
      return `${part.title}: enter a mark from 0 to ${displayScore(part.maxScore)}.`
    }
    const bad = part.questions.find((q) => {
      const entry = this.entry(q.id)
      return entry.kind === 'score' && valid(entry.text, q.maxScore) === null
    })
    return `${part.title}, question ${bad?.position ?? 0}: enter a mark from 0 to ${displayScore(bad?.maxScore)}.`
  }

  /** The part's edits, [] when unchanged, or null when an input is invalid. */
  private edits(part: Part): Edit[] | null {
    const mode = this.edited.get(part.id)
    if (mode === undefined) return []
    if (mode === 'byQuestion') {
      const result: Edit[] = []
      for (const question of part.questions) {
        const draft = this.entry(question.id)
        if (sameEntry(draft, this.baseEntries.get(question.id) ?? NOT_ENTERED)) continue
        if (draft.kind === 'notEntered') result.push({ answer: { kind: 'clear', questionId: question.id } })
        else if (draft.kind === 'choice') result.push({ answer: { kind: 'choice', questionId: question.id, choiceId: draft.choiceId } })
        else {
          const score = valid(draft.text, question.maxScore)
          if (score === null) return null
          result.push({ answer: { kind: 'score', questionId: question.id, score } })
        }
      }
      return result
    }
    const draft = this.totals.get(part.id) ?? EMPTY_TOTAL
    if (sameTotal(draft, this.baseTotals.get(part.id) ?? EMPTY_TOTAL)) return []
    const text = trimSpaces(draft.text)
    if (text === '' && !draft.excused) return [{ mark: { partId: part.id, score: null, excusedReason: null } }]
    const score = valid(text, part.maxScore)
    if (score === null) return null
    const reason = trimAll(draft.reason)
    if (draft.excused && reason === '') return null
    return [{ mark: { partId: part.id, score, excusedReason: draft.excused ? prefix(reason, 500) : null } }]
  }

  private body(): SaveBody | null {
    const marks: MarkEdit[] = []
    const answers: AnswerEdit[] = []
    for (const part of this.assignment.parts) {
      const edits = this.edits(part)
      if (edits === null) return null
      for (const edit of edits) {
        if ('mark' in edit) marks.push(edit.mark)
        else answers.push(edit.answer)
      }
    }
    const note = this._feedback !== this.baseFeedback ? prefix(this._feedback, 5000) : null
    if (marks.length === 0 && answers.length === 0 && note === null) return null
    return saveMarksBody(this._student.id, this._student.version, marks, answers, note)
  }

  // MARK: - Save

  /** Saves the draft (or retries the unacknowledged request unchanged). True only on acknowledgment. */
  async save(): Promise<boolean> {
    if (this.isSaving || !this.assignment.actions.mark || this.isConflict) return false
    let command = this.pending
    if (command === null) {
      const body = this.canSave ? this.body() : null
      if (body === null) return false
      command = createCommand(body, this.env.newKey)
      this.pending = command
    }
    this._saveState = { status: 'saving' }
    this.changed()
    const current = () => this.env.isCurrent(this.context)
    let saved: StudentWork
    try {
      saved = await this.env.api.patch(`api/v1/assignments/${encodeURIComponent(this.assignment.id)}/marks`, command.body, command.key, {
        structuredErrors: true,
        decode: decodeSaveResult,
      })
    } catch (error) {
      // A late answer for another account or academy changes nothing here and signs nobody out.
      if (!current()) return false
      this.saveFailed(error)
      this.changed()
      if (error instanceof ApiError && error.kind === 'unauthenticated') await this.env.onUnauthenticated()
      if (error instanceof ApiError && error.kind === 'forbidden') await this.env.onForbidden()
      return false
    }
    if (!current()) return false
    this.pending = null
    this._saveState = { status: 'idle' }
    this.rebase(saved, false)
    this.env.feedback?.('success')
    this.hooks.onSaved(saved)
    this.changed()
    return true
  }

  private saveFailed(error: unknown): void {
    const outcome = writeOutcome(error)
    switch (outcome.kind) {
      case 'unauthenticated':
        this._saveState = { status: 'uncertain', message: 'Sign in again to finish saving.' }
        return
      case 'forbidden':
        this.pending = null
        this._saveState = { status: 'failed', message: 'You no longer have access to mark in this academy.' }
        return
      case 'uncertain':
      case 'cancelled': {
        // Not applied or unknown: the same key reconciles it.
        const throttled = outcome.kind === 'uncertain' && outcome.reason === 'throttled'
        const server = outcome.kind === 'uncertain' && outcome.failure !== null
        if (!throttled && !server) this.env.feedback?.('warning')
        const message = throttled
          ? 'Too many saves. Retry in a moment.'
          : server
            ? "The server couldn't confirm the save. Retry."
            : "Couldn't confirm the save. Retry: it won't save twice."
        this._saveState = { status: 'uncertain', message }
        return
      }
      case 'rejected': {
        this.pending = null
        const { failure } = outcome
        if (failure.code === 'MARKS_CONFLICT') {
          try {
            this._saveState = { status: 'conflict', current: decodeConflictCurrent(failure.details) }
            this.env.feedback?.('warning')
            return
          } catch {}
        }
        this.env.feedback?.('failure')
        this._saveState = { status: 'failed', message: rejectionMessage(failure) }
      }
    }
  }

  /** Conflict review: start again from the latest server work. */
  useLatest(): void {
    if (this._saveState.status !== 'conflict') return
    const { current } = this._saveState
    this._saveState = { status: 'idle' }
    this.rebase(current, false)
    this.changed()
  }

  /** Conflict review: keep the attempted inputs, now against the latest version. Saving is a new action. */
  reapply(): void {
    if (this._saveState.status !== 'conflict') return
    const { current } = this._saveState
    this._saveState = { status: 'idle' }
    this.rebase(current, true)
    this.changed()
  }

  /** Drops the draft and any unconfirmed request. */
  discard(): void {
    this.pending = null
    this._saveState = { status: 'idle' }
    this.rebase(this._student, false)
    this.changed()
  }

  /** Back in the foreground: an unconfirmed save retries with the same key. */
  async resumed(): Promise<void> {
    if (this.isUncertain) await this.save()
  }

  private rebase(work: StudentWork, keepDraft: boolean): void {
    this._student = work
    const entries = new Map<string, Entry>()
    for (const answer of work.answers) {
      const kind = this.assignment.parts.find((p) => p.id === answer.partId)?.kind ?? null
      entries.set(
        answer.questionId,
        isChoiceKind(kind) ? { kind: 'choice', choiceId: answer.choiceId } : { kind: 'score', text: displayScore(answer.score) },
      )
    }
    const totals = new Map<string, Total>()
    for (const mark of work.marks) {
      if (mark.fromAnswers) continue
      totals.set(mark.partId, { text: displayScore(mark.score), excused: mark.kind === 'excused', reason: mark.reason ?? '' })
    }
    this.baseEntries = entries
    this.baseTotals = totals
    this.baseFeedback = work.feedback
    if (keepDraft) return
    this.entries = new Map(entries)
    this.totals = new Map(totals)
    this._feedback = work.feedback
    this.edited = new Map()
  }
}

function valid(text: string, max: string): string | null {
  const value = hundredths(text)
  const limit = hundredths(max)
  return value === null || limit === null || value > limit ? null : formatScore(value)
}

function restore<V>(target: Map<string, V>, base: Map<string, V>, key: string): void {
  const value = base.get(key)
  if (value === undefined) target.delete(key)
  else target.set(key, value)
}
