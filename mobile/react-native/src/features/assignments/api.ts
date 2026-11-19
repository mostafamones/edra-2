// Staff assignment contract (web/docs/api/assignments.openapi.yaml). Scores stay decimal strings.
// Decoders validate the fields the app relies on and apply the iOS defaults for older payloads.

export type AssignmentSummary = Readonly<{
  id: string
  title: string
  /** ISO date-time, advisory only. */
  dueAt: string | null
  /** active, closed or archived. */
  state: string
  maxScore: string
  recipientCount: number
}>

export type AssignmentsPage = Readonly<{ total: number; assignments: readonly AssignmentSummary[] }>

/** Server-granted capabilities; a missing one grants nothing. The app never derives permissions. */
export type Actions = Readonly<{ mark: boolean; recordWork: boolean; announce: boolean }>
export const NO_ACTIONS: Actions = Object.freeze({ mark: false, recordWork: false, announce: false })

export type Choice = Readonly<{ id: string; position: number; /** Staff answer key; null when not sent. */ isCorrect: boolean | null }>
export type Question = Readonly<{ id: string; position: number; maxScore: string; choices: readonly Choice[] }>
export type Part = Readonly<{
  id: string
  position: number
  title: string
  maxScore: string
  /** online_questions, answer_sheet, file_upload, another (unknown: shown, never edited), or null (legacy total-only). */
  kind: string | null
  questions: readonly Question[]
}>

export type AssignmentDetail = Readonly<{
  id: string
  title: string
  state: string
  maxScore: string
  parts: readonly Part[]
  studentCodesEnabled: boolean
  actions: Actions
}>

export type Mark = Readonly<{
  partId: string
  /** mark or excused. */
  kind: string
  score: string
  reason: string | null
  fromAnswers: boolean
}>
/** choiceId null: recorded as unanswered (Blank). */
export type Answer = Readonly<{ questionId: string; partId: string; choiceId: string | null; score: string }>

/** One recipient's work, answers, marks and result state. */
export type StudentWork = Readonly<{
  /** The permanent record id; every save names it. */
  id: string
  fullName: string
  groupName: string | null
  studentCode: string | null
  workStatus: string
  feedback: string
  version: number
  marks: readonly Mark[]
  answers: readonly Answer[]
  total: string | null
  /** unmarked, partial or complete. */
  marking: string
  publication: Readonly<{ revision: number; total: string }> | null
  /** unpublished, published or pending_correction. */
  publicationState: string
}>

export type StudentsPage = Readonly<{ total: number; students: readonly StudentWork[] }>

const CHOICE_KINDS = new Set(['online_questions', 'answer_sheet'])
const KNOWN_KINDS = new Set(['online_questions', 'answer_sheet', 'file_upload'])

export const isChoiceKind = (kind: string | null): boolean => kind !== null && CHOICE_KINDS.has(kind)
export const isWrittenWork = (part: Part | null | undefined): boolean => part?.kind === 'file_upload'
export const takesAnswers = (part: Part): boolean => part.kind !== null && KNOWN_KINDS.has(part.kind) && part.questions.length > 0
/** Legacy (null) and known kinds take a total; an unknown kind is never editable. */
export const takesTotal = (part: Part): boolean => part.kind === null || KNOWN_KINDS.has(part.kind)
/** A, B, C… from the position. */
export const choiceLetter = (choice: Choice): string => String.fromCharCode(64 + Math.min(Math.max(choice.position, 1), 26))

export const markFor = (student: StudentWork, partId: string): Mark | undefined => student.marks.find((m) => m.partId === partId)

/** Complete private work that differs from (or has no) official result. */
export const isAnnounceable = (s: StudentWork): boolean => s.marking === 'complete' && s.publicationState !== 'published'

export function studentStatus(s: StudentWork): string {
  if (s.workStatus === 'excused') return 'Excused'
  if (s.marking === 'complete') {
    if (s.publicationState === 'published') return 'Announced'
    return s.publicationState === 'pending_correction' ? 'Correction pending' : 'Marked'
  }
  if (s.marking === 'partial') return s.publicationState === 'pending_correction' ? 'Partial · correction pending' : 'Partial'
  return s.workStatus === 'submitted' || s.workStatus === 'late' ? 'Needs marking' : 'Not received'
}

// MARK: - Requests

/** nil score clears the part. */
export type MarkEdit = Readonly<{ partId: string; score: string | null; excusedReason: string | null }>
export type AnswerEdit =
  | Readonly<{ kind: 'choice'; questionId: string; /** null: explicitly unanswered (Blank). */ choiceId: string | null }>
  | Readonly<{ kind: 'score'; questionId: string; score: string }>
  | Readonly<{ kind: 'clear'; questionId: string }>

/** PATCH .../marks body, already in wire form. */
export function saveMarksBody(recordId: string, expectedVersion: number, marks: MarkEdit[], answers: AnswerEdit[], feedback: string | null) {
  const body: Record<string, unknown> = { annual_student_record_id: recordId, expected_version: expectedVersion }
  if (marks.length > 0) {
    body.marks = marks.map((m) => ({
      part_id: m.partId,
      score: m.score,
      ...(m.excusedReason === null ? {} : { excused_reason: m.excusedReason }),
    }))
  }
  if (answers.length > 0) {
    body.answers = answers.map((a) =>
      a.kind === 'choice'
        ? { question_id: a.questionId, choice_id: a.choiceId }
        : a.kind === 'score'
          ? { question_id: a.questionId, score: a.score }
          : { question_id: a.questionId, clear: true },
    )
  }
  if (feedback !== null) body.feedback = feedback
  return body
}

export function announceBody(students: readonly StudentWork[]) {
  return { items: students.map((s) => ({ annual_student_record_id: s.id, expected_version: s.version })) }
}

// MARK: - Decoding

type Json = Record<string, unknown>

function record(value: unknown): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError('expected an object')
  return value as Json
}
function str(o: Json, key: string): string {
  const v = o[key]
  if (typeof v !== 'string') throw new TypeError(`${key}: expected a string`)
  return v
}
function optStr(o: Json, key: string): string | null {
  const v = o[key]
  if (v == null) return null
  if (typeof v !== 'string') throw new TypeError(`${key}: expected a string`)
  return v
}
function int(o: Json, key: string): number {
  const v = o[key]
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new TypeError(`${key}: expected an integer`)
  return v
}
function bool(o: Json, key: string): boolean {
  const v = o[key]
  if (v == null) return false
  if (typeof v !== 'boolean') throw new TypeError(`${key}: expected a boolean`)
  return v
}
function list<T>(o: Json, key: string, item: (v: unknown) => T, optional = true): T[] {
  const v = o[key]
  if (v == null && optional) return []
  if (!Array.isArray(v)) throw new TypeError(`${key}: expected an array`)
  return v.map(item)
}
const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position

export function decodeSummary(value: unknown): AssignmentSummary {
  const o = record(value)
  return {
    id: str(o, 'id'),
    title: str(o, 'title'),
    dueAt: optStr(o, 'due_at'),
    state: str(o, 'state'),
    maxScore: str(o, 'max_score'),
    recipientCount: int(o, 'recipient_count'),
  }
}

export function decodeAssignmentsPage(value: unknown): AssignmentsPage {
  const o = record(value)
  return { total: int(o, 'total'), assignments: list(o, 'assignments', decodeSummary, false) }
}

function decodeChoice(value: unknown): Choice {
  const o = record(value)
  const isCorrect = o.is_correct
  if (isCorrect != null && typeof isCorrect !== 'boolean') throw new TypeError('is_correct: expected a boolean')
  return { id: str(o, 'id'), position: int(o, 'position'), isCorrect: isCorrect ?? null }
}

function decodeQuestion(value: unknown): Question {
  const o = record(value)
  return { id: str(o, 'id'), position: int(o, 'position'), maxScore: str(o, 'max_score'), choices: list(o, 'choices', decodeChoice) }
}

function decodePart(value: unknown): Part {
  const o = record(value)
  return {
    id: str(o, 'id'),
    position: int(o, 'position'),
    title: str(o, 'title'),
    maxScore: str(o, 'max_score'),
    kind: optStr(o, 'kind'),
    questions: list(o, 'questions', decodeQuestion).sort(byPosition),
  }
}

export function decodeDetail(value: unknown): AssignmentDetail {
  const o = record(value)
  const actions = o.actions == null ? null : record(o.actions)
  return {
    id: str(o, 'id'),
    title: str(o, 'title'),
    state: str(o, 'state'),
    maxScore: str(o, 'max_score'),
    parts: list(o, 'parts', decodePart, false).sort(byPosition),
    studentCodesEnabled: bool(o, 'student_codes_enabled'),
    actions: actions
      ? { mark: bool(actions, 'mark'), recordWork: bool(actions, 'record_work'), announce: bool(actions, 'announce') }
      : NO_ACTIONS,
  }
}

function decodeMark(value: unknown): Mark {
  const o = record(value)
  return {
    partId: str(o, 'part_id'),
    kind: str(o, 'kind'),
    score: str(o, 'score'),
    reason: optStr(o, 'reason'),
    fromAnswers: bool(o, 'from_answers'),
  }
}

function decodeAnswer(value: unknown): Answer {
  const o = record(value)
  return { questionId: str(o, 'question_id'), partId: str(o, 'part_id'), choiceId: optStr(o, 'choice_id'), score: str(o, 'score') }
}

export function decodeStudent(value: unknown): StudentWork {
  const o = record(value)
  const publication = o.publication == null ? null : record(o.publication)
  return {
    id: str(o, 'annual_student_record_id'),
    fullName: str(o, 'full_name'),
    groupName: optStr(o, 'group_name'),
    studentCode: optStr(o, 'student_code'),
    workStatus: str(o, 'work_status'),
    feedback: optStr(o, 'feedback') ?? '',
    version: int(o, 'version'),
    marks: list(o, 'marks', decodeMark),
    answers: list(o, 'answers', decodeAnswer),
    total: optStr(o, 'total'),
    marking: str(o, 'marking'),
    publication: publication ? { revision: int(publication, 'revision'), total: str(publication, 'total') } : null,
    publicationState: str(o, 'publication_state'),
  }
}

export function decodeStudentsPage(value: unknown): StudentsPage {
  const o = record(value)
  return { total: int(o, 'total'), students: list(o, 'students', decodeStudent, false) }
}

/** student-resolution and MARKS_CONFLICT `details.current` / save results all carry one student. */
export const decodeResolution = (value: unknown): StudentWork => decodeStudent(record(value).student)
export const decodeSaveResult = (value: unknown): StudentWork => decodeStudent(record(value).student)
export const decodeConflictCurrent = (details: unknown): StudentWork => decodeStudent(record(details).current)

export function decodeAnnounceResult(value: unknown): Readonly<{ replayed: boolean }> {
  const o = record(value)
  list(o, 'results', record, false)
  return { replayed: bool(o, 'replayed') }
}

/** `details.failures` of 409 PUBLICATION_REJECTED: record id → reason (stale, incomplete, not_recipient). */
export function decodeAnnounceFailures(details: unknown): Array<{ id: string; reason: string }> {
  return list(record(details), 'failures', (v) => {
    const o = record(v)
    return { id: str(o, 'annual_student_record_id'), reason: str(o, 'reason') }
  }, false)
}
