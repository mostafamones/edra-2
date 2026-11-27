// Wire types for web/docs/api/sessions-attendance.openapi.yaml, kept in the server's snake_case.
// Only the fields this feature reads; dates are ISO strings as sent.

export type AttendanceStatus = 'unknown' | 'present' | 'late' | 'absent' | 'excused'
/** `expected`/`eligible` were captured at start; `unexpected` was added by staff. Unknown values from a newer server are never expected. */
export type RosterOrigin = 'expected' | 'eligible' | 'unexpected' | (string & {})

export interface LiveSession {
  id: string
  academy_id: string
  academy_name: string
  schedule_title: string
  group_name: string | null
  level_name: string | null
  track_name: string | null
  location: string | null
  state: 'live' | 'ended'
  started_at: string
  started_by_name: string | null
  auto_end_at: string
  roster_count: number
}

export interface LiveSessionsPage {
  sessions: LiveSession[]
  next_cursor: string | null
}

export interface StartableSchedule {
  id: string
  title: string
  kind: 'recurring' | 'one_off'
  audience: 'group' | 'level' | 'program'
  mandatory: boolean
  location: string | null
  group_name: string | null
  level_name: string | null
  track_name: string | null
  /** ISO weekday 1 = Monday; academy-local HH:mm:ss wall-clock times. */
  slots: { weekday: number; starts_at: string; ends_at: string }[]
  meetings: { occurs_on: string; starts_at: string; ends_at: string }[]
  /** Grouping hint only, never an eligibility filter. */
  meets_today: boolean
  /** Starting opens this live session instead of creating another. */
  live_session_id: string | null
  /** UI hint; the start command re-checks authority. */
  can_start: boolean
}

export interface SchedulesPage {
  time_zone: string
  today: string
  academic_year: { id: string; start_year: number } | null
  schedules: StartableSchedule[]
  next_offset: number | null
}

export interface StartedSession {
  id: string
  academy_id: string
  schedule_title: string
  group_name: string | null
  level_name: string | null
  track_name: string | null
  location: string | null
  state: 'live' | 'ended'
  started_at: string
  started_by_name: string | null
  auto_end_at: string
  roster_count: number
  session_archived_at?: string | null
}

export interface StartSessionResult {
  outcome: 'started' | 'existing' | 'replayed'
  replayed: boolean
  session: StartedSession
}

export interface AttendanceEntry {
  annual_student_record_id: string
  full_name: string
  student_code?: string | null
  origin: RosterOrigin
  /** Current draft value. */
  status: AttendanceStatus
  checked_in_at?: string | null
  /** Send back as `expected_version`. */
  version: number
  published_status?: AttendanceStatus | null
  published_at?: string | null
  /** Sheet reads only: finalized and the draft differs from the official value. */
  correction_pending?: boolean
}

export interface PermittedActions {
  check_in: boolean
  edit: boolean
  publish: boolean
}

export interface AttendanceSheet {
  session: {
    mandatory: boolean
    state: 'live' | 'ended'
    /** The session itself is archived (read-only, not counted). Absent on older servers. */
    archived_at?: string | null
    year_open?: boolean
    metadata_version?: number
  }
  student_codes_enabled: boolean
  /** Monotonic draft revision; reviewed commands name it. */
  revision: number
  published_revision: number | null
  publication_count: number
  last_published_at?: string | null
  last_published_by_name?: string | null
  publication: 'unpublished' | 'published' | 'pending_corrections'
  permitted_actions: PermittedActions
  counts: Record<AttendanceStatus | 'total', number>
  entries: AttendanceEntry[]
}

export interface CheckInResult {
  outcome: 'recorded' | 'already_recorded' | 'review_required'
  entry: AttendanceEntry
  revision: number
  replayed: boolean
}

export interface SetAttendanceResult {
  outcome: 'updated'
  changed: number
  entry: AttendanceEntry
  revision: number
  replayed: boolean
}

export interface UnrecordedAbsenceResult {
  outcome: 'updated' | 'unchanged'
  changed: number
  revision: number
  replayed: boolean
}

export interface AttendeeCandidate {
  annual_student_record_id: string
  full_name: string
  level_name: string | null
  group_name: string | null
  participation_type: 'in_person' | 'online_only'
  student_code: string | null
}

export interface AttendeeCandidates {
  items: AttendeeCandidate[]
  has_more: boolean
}

export interface AddAttendeeResult {
  outcome: 'added' | 'already_on_roster'
  entry: AttendanceEntry
  revision: number
  replayed: boolean
}

export interface PublishResult {
  outcome: 'published' | 'unchanged' | 'already_published'
  publication_id: string | null
  revision: number
  item_count: number
  replayed: boolean
}
