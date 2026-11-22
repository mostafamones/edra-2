// Staff student records contract (web/docs/api/students.openapi.yaml). Read only; every rule (search, rates,
// official results) is decided by the server. Scores stay decimal strings.

export type StatusFilter = 'active' | 'archived' | 'all'
export type AssessmentKind = 'assignment' | 'quiz' | 'exam'
export type OnlineAccount = 'not_connected' | 'connected' | 'suspended'

export type AcademicYear = Readonly<{ id: string; startYear: number; closed: boolean }>

export type StudentRow = Readonly<{
  id: string
  fullName: string
  levelName: string
  trackName: string | null
  groupName: string | null
  participationType: string
  archived: boolean
  onlineAccount: OnlineAccount
}>

export type DirectoryPage = Readonly<{ academicYear: AcademicYear | null; total: number; students: readonly StudentRow[] }>

export type StudentDetail = Readonly<{
  id: string
  fullName: string
  studentPhone: string
  parentPhone: string
  academicYear: AcademicYear
  levelName: string
  trackName: string | null
  groupName: string | null
  participationType: string
  archived: boolean
  onlineAccount: OnlineAccount
  manuallySuspended: boolean
}>

export type StatusCounts = Readonly<{ present: number; late: number; absent: number; excused: number; unknown: number }>
export type AttendanceItem = Readonly<{ sessionId: string; startedAt: string; title: string | null; groupName: string | null; status: string; mandatory: boolean }>
export type AttendancePage = Readonly<{
  total: number
  /** Full counted history; `rate` is null without a qualifying record. */
  mandatory: StatusCounts & Readonly<{ rate: number | null }>
  optional: StatusCounts & Readonly<{ attended: number }>
  items: readonly AttendanceItem[]
}>

export type AssessmentStatus =
  | 'announced' | 'correction_pending' | 'excused' | 'missing' | 'awaiting_submission' | 'marking_incomplete' | 'unannounced'

export type AssessmentItem = Readonly<{
  id: string
  kind: AssessmentKind
  title: string
  createdAt: string
  status: AssessmentStatus
  /** The announced publication snapshot only. */
  result: Readonly<{ score: string; maximum: string | null; percentage: string | null; announcedAt: string }> | null
  /** Private current marking (staff only); never shown as the official result. */
  marking: Readonly<{ complete: boolean; score: string | null; maximum: string | null }>
}>
export type AssessmentPage = Readonly<{ total: number; items: readonly AssessmentItem[] }>

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
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) throw new TypeError(`${key}: expected a count`)
  return v
}
function bool(o: Json, key: string): boolean {
  const v = o[key]
  if (typeof v !== 'boolean') throw new TypeError(`${key}: expected a boolean`)
  return v
}
function list<T>(o: Json, key: string, item: (v: unknown) => T): T[] {
  const v = o[key]
  if (!Array.isArray(v)) throw new TypeError(`${key}: expected an array`)
  return v.map(item)
}
function oneOf<T extends string>(o: Json, key: string, values: readonly T[]): T {
  const v = str(o, key)
  if (!(values as readonly string[]).includes(v)) throw new TypeError(`${key}: unexpected ${v}`)
  return v as T
}

const ACCOUNTS = ['not_connected', 'connected', 'suspended'] as const
const KINDS = ['assignment', 'quiz', 'exam'] as const
const STATUSES = ['announced', 'correction_pending', 'excused', 'missing', 'awaiting_submission', 'marking_incomplete', 'unannounced'] as const

function decodeYear(value: unknown): AcademicYear {
  const o = record(value)
  return { id: str(o, 'id'), startYear: int(o, 'start_year'), closed: o.closed === true }
}

function decodeRow(value: unknown): StudentRow {
  const o = record(value)
  return {
    id: str(o, 'id'),
    fullName: str(o, 'full_name'),
    levelName: str(o, 'level_name'),
    trackName: optStr(o, 'track_name'),
    groupName: optStr(o, 'group_name'),
    participationType: str(o, 'participation_type'),
    archived: bool(o, 'archived'),
    onlineAccount: oneOf(o, 'online_account', ACCOUNTS),
  }
}

export function decodeDirectoryPage(value: unknown): DirectoryPage {
  const o = record(value)
  return { academicYear: o.academic_year == null ? null : decodeYear(o.academic_year), total: int(o, 'total'), students: list(o, 'students', decodeRow) }
}

export function decodeDetail(value: unknown): StudentDetail {
  const o = record(value)
  return {
    id: str(o, 'id'),
    fullName: str(o, 'full_name'),
    studentPhone: str(o, 'student_phone'),
    parentPhone: str(o, 'parent_phone'),
    academicYear: decodeYear(o.academic_year),
    levelName: str(o, 'level_name'),
    trackName: optStr(o, 'track_name'),
    groupName: optStr(o, 'group_name'),
    participationType: str(o, 'participation_type'),
    archived: bool(o, 'archived'),
    onlineAccount: oneOf(o, 'online_account', ACCOUNTS),
    manuallySuspended: bool(o, 'manually_suspended'),
  }
}

function decodeCounts(o: Json): StatusCounts {
  return { present: int(o, 'present'), late: int(o, 'late'), absent: int(o, 'absent'), excused: int(o, 'excused'), unknown: int(o, 'unknown') }
}

export function decodeAttendancePage(value: unknown): AttendancePage {
  const o = record(value)
  const mandatory = record(o.mandatory)
  const optional = record(o.optional)
  const rate = mandatory.rate
  if (rate !== null && (typeof rate !== 'number' || rate < 0 || rate > 100)) throw new TypeError('rate: expected a percentage or null')
  return {
    total: int(o, 'total'),
    mandatory: { ...decodeCounts(mandatory), rate },
    optional: { ...decodeCounts(optional), attended: int(optional, 'attended') },
    items: list(o, 'items', (v) => {
      const i = record(v)
      return {
        sessionId: str(i, 'session_id'),
        startedAt: str(i, 'started_at'),
        title: optStr(i, 'title'),
        groupName: optStr(i, 'group_name'),
        status: str(i, 'status'),
        mandatory: bool(i, 'mandatory'),
      }
    }),
  }
}

function decodeAssessment(value: unknown): AssessmentItem {
  const o = record(value)
  const result = o.result == null ? null : record(o.result)
  const marking = record(o.marking)
  return {
    id: str(o, 'id'),
    kind: oneOf(o, 'kind', KINDS),
    title: str(o, 'title'),
    createdAt: str(o, 'created_at'),
    status: oneOf(o, 'status', STATUSES),
    result: result && {
      score: str(result, 'score'),
      maximum: optStr(result, 'maximum'),
      percentage: optStr(result, 'percentage'),
      announcedAt: str(result, 'announced_at'),
    },
    marking: { complete: bool(marking, 'complete'), score: optStr(marking, 'score'), maximum: optStr(marking, 'maximum') },
  }
}

export function decodeAssessmentPage(value: unknown): AssessmentPage {
  const o = record(value)
  return { total: int(o, 'total'), items: list(o, 'items', decodeAssessment) }
}

// MARK: - Display rules (labels only; values come from the server)

export const yearLabel = (year: AcademicYear) => `${year.startYear}–${year.startYear + 1}`
export const participationLabel = (type: string) => (type === 'online_only' ? 'Online' : type === 'in_person' ? 'In person' : type)
export const placementLabel = (s: Pick<StudentRow, 'levelName' | 'trackName' | 'groupName'>) =>
  [s.levelName, s.trackName, s.groupName ?? 'No group'].filter((part) => part !== null).join(' · ')

/** Manual suspension applies even without a connected account; archival suspends a connected one. */
export function accessLabel(s: Pick<StudentDetail, 'onlineAccount' | 'manuallySuspended'>): string {
  if (s.onlineAccount === 'not_connected') return s.manuallySuspended ? 'Not connected · Suspended' : 'Not connected'
  return s.onlineAccount === 'suspended' ? 'Suspended' : 'Active'
}

export const ATTENDANCE_LABELS: Record<string, string> = { present: 'Present', late: 'Late', absent: 'Absent', excused: 'Excused', unknown: 'Unknown' }
export const rateLabel = (rate: number | null) => (rate === null ? 'No rate' : `${Math.round(rate * 10) / 10}%`)

export const STATUS_LABELS: Record<AssessmentStatus, string> = {
  announced: 'Announced',
  correction_pending: 'Correction pending',
  excused: 'Excused',
  missing: 'Missing',
  awaiting_submission: 'Awaiting submission',
  marking_incomplete: 'Needs marking',
  unannounced: 'Not announced',
}
export const KIND_TITLES: Record<AssessmentKind, string> = { assignment: 'Assignments', quiz: 'Quizzes', exam: 'Exams' }
