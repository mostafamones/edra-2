import type { AttendanceSheet, AttendeeCandidate, LiveSession, StartableSchedule } from '../contract.ts'
import type { Official } from '../detail.ts'

export { statusLabel } from '../scanner.ts'

const present = (values: (string | null | undefined)[]) => values.filter((v): v is string => !!v)

/** "Nine A · Grade 9 · Science · Room 4" (SessionCard). */
export const sessionDetails = (s: LiveSession) => present([s.group_name, s.level_name, s.track_name, s.location]).join(' · ')

/** "Nine A · Grade 9 · Science", or "Grade 9 · Whole level". */
export const audienceLabel = (s: StartableSchedule) =>
  present([s.group_name, s.level_name, s.audience === 'level' ? 'Whole level' : s.track_name]).join(' · ')

export const scheduleDetails = (s: StartableSchedule) => present([audienceLabel(s), s.location]).join(' · ')

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "16:05" or "16:05:00" → "4:05 PM", without any time-zone conversion. */
export function wallTime(value: string): string {
  const parts = value.split(':').map(Number)
  if (parts.length < 2 || parts.some(Number.isNaN)) return value
  const [hours, minutes] = parts
  return `${hours % 12 === 0 ? 12 : hours % 12}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`
}

/** "2026-10-16" → "Fri, Oct 16, 2026", kept on the same calendar day. */
export function calendarDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return value
  const day = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]))
  if (day.getUTCDate() !== +match[3]) return value
  return `${WEEKDAYS[(day.getUTCDay() + 6) % 7]}, ${MONTHS[day.getUTCMonth()]} ${day.getUTCDate()}, ${day.getUTCFullYear()}`
}

/** Planned slots or meetings, e.g. "Sat 4:00 PM–5:30 PM" or "Thu, Oct 16, 2026 10:00 AM–11:00 AM". */
export function planLines(s: StartableSchedule): string[] {
  if (s.kind === 'recurring') {
    return s.slots.map((slot) => `${WEEKDAYS[slot.weekday - 1] ?? '?'} ${wallTime(slot.starts_at)}–${wallTime(slot.ends_at)}`)
  }
  return s.meetings.map((m) => `${calendarDate(m.occurs_on)} ${wallTime(m.starts_at)}–${wallTime(m.ends_at)}`)
}

/** Device-local short time, as SwiftUI `Text(date, style: .time)`. */
export const shortTime = (date: Date | string) =>
  new Date(date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

/** `.formatted(date: .abbreviated, time: .shortened)`. */
export const shortDateTime = (date: Date | string) =>
  new Date(date).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export function officialLabel(official: Official): string {
  switch (official) {
    case 'finalized':
      return 'Finalized'
    case 'correctionsPending':
      return 'Corrections pending'
    default:
      return 'Not finalized'
  }
}

export const correctionCount = (sheet: AttendanceSheet) => sheet.entries.filter((e) => e.correction_pending === true).length

export const candidatePlacement = (c: AttendeeCandidate) =>
  present([c.level_name, c.group_name, c.participation_type === 'online_only' ? 'Online' : null]).join(' · ')

/** Schedules split as the picker shows them: planned today first, a grouping hint only. */
export function groupSchedules(schedules: StartableSchedule[]) {
  const today = schedules.filter((s) => s.meets_today)
  const others = schedules.filter((s) => !s.meets_today)
  const sections: { title: string; data: StartableSchedule[] }[] = []
  if (today.length) sections.push({ title: 'Planned today', data: today })
  if (others.length) sections.push({ title: today.length ? 'Other schedules' : 'Schedules', data: others })
  return sections
}

/** The device zone, for the "Times are in academy time" footer. */
export const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone
