// Screen wording and derived display state, kept out of the TSX so it is testable with node --test.
import { isWrittenWork, type Actions, type Part, type StudentWork } from './api.ts'
import type { Mode } from './marking.ts'
import type { Pane, Tab } from './platform.ts'
import { displayScore } from './score.ts'
import type { AnnounceState, Announcement, Filter } from './workspace.ts'

export const SEARCH_PROMPT = 'Search students in this assessment...'

/** Overdue only while still active; the due date is advisory. */
export const isOverdue = (dueAt: string | null, state: string, now: number): boolean =>
  dueAt !== null && state === 'active' && Date.parse(dueAt) < now

export function accessStatus(actions: Actions, detailState: string | undefined): string | null {
  if (!actions.mark) return detailState === 'archived' ? 'Archived · read-only' : 'Read-only'
  if (!actions.recordWork) return 'Closed · received work only'
  return null
}

export type Tone = 'green' | 'orange' | 'secondary'
export function statusTone(status: string): Tone {
  if (status === 'Announced') return 'green'
  return status === 'Marked' || status === 'Correction pending' ? 'orange' : 'secondary'
}

export const studentsEmptyTitle = (search: string, filter: Filter): string =>
  search === '' && filter === 'all' ? 'No students' : 'No matching students'

/** A workspace row read as one element: name, code when shown, score and status (the row shows no group). */
export const studentRowLabel = (s: StudentWork, max: string | null | undefined, status: string): string =>
  [s.fullName, s.studentCode, `${displayScore(s.total)} of ${displayScore(max)}`, status].filter((v) => v !== null).join(', ')

/** Students, Scan (codes usable, not selecting), then the search tab, which is the confirm button while selecting. */
export function workspaceTabs(scanAvailable: boolean, selecting: boolean, hasSearchTab: boolean): Tab[] {
  const tabs: Tab[] = [{ pane: 'students', title: 'Students', icon: 'users' }]
  if (scanAvailable && !selecting) tabs.push({ pane: 'scan', title: 'Scan', icon: 'scan' })
  if (hasSearchTab) {
    tabs.push(selecting ? { pane: 'search', title: 'Announce selected', icon: 'tick-02', search: true } : { pane: 'search', title: 'Search', icon: 'search-01', search: true })
  }
  return tabs
}

/** A tab tap: the search tab while selecting reviews the selection instead of switching. */
export const tabAction = (pane: Pane, selecting: boolean): 'review' | 'switch' => (pane === 'search' && selecting ? 'review' : 'switch')

// MARK: - Announce

export const countLabel = (count: number): string => (count === 1 ? '1 student' : `${count} students`)

export function announceStatus(state: AnnounceState): string | null {
  return state.status === 'reviewing' || state.status === 'sending' ? null : state.message
}

/** Nothing more to send: only Close remains. */
export const announceDone = (state: AnnounceState): boolean => state.status === 'rejected' || state.status === 'failed'

export const rejection = (announcement: Announcement, student: StudentWork): string | null =>
  announcement.state.status === 'rejected' ? (announcement.state.reasons[student.id] ?? null) : null

// MARK: - Marking

export function questionRange(page: number, pageSize: number, shown: number, count: number): string {
  const first = page * pageSize
  return `Questions ${first + 1}–${first + shown} of ${count}`
}

export function enteredText(entered: number, count: number, draftWrittenTotal: string | null, partMax: string | undefined): string {
  const text = `${entered} of ${count} entered`
  return draftWrittenTotal === null ? text : `${text} · ${draftWrittenTotal} / ${displayScore(partMax)}`
}

/** The shortcut chips show above the keyboard for Fast mark and Written Work questions. */
export const showsQuickBar = (focused: boolean, mode: Mode, part: Part | undefined): boolean =>
  focused && (mode === 'fast' || (isWrittenWork(part) && mode === 'byQuestion'))

export const leaveTitle = (name: string): string => `Save changes for ${name}?`
export const replaceMessage = (titles: readonly string[]): string => `Saving replaces the saved ${titles.join(', ')} marks entered the other way.`
