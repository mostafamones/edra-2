// Run: node --test mobile/react-native/src/features/sessions/screens/*.test.ts (Node ≥ 22.18, no dependencies).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { StartableSchedule } from '../contract.ts'
import { audienceLabel, calendarDate, groupSchedules, planLines, wallTime } from './format.ts'

const schedule = (patch: Partial<StartableSchedule>): StartableSchedule => ({
  id: 's',
  title: 'Physics',
  kind: 'recurring',
  audience: 'group',
  mandatory: true,
  location: null,
  group_name: 'Nine A',
  level_name: 'Grade 9',
  track_name: 'Science',
  slots: [],
  meetings: [],
  meets_today: false,
  live_session_id: null,
  can_start: true,
  ...patch,
})

test('wall-clock times format without time-zone conversion', () => {
  assert.equal(wallTime('16:05:00'), '4:05 PM')
  assert.equal(wallTime('00:30'), '12:30 AM')
  assert.equal(wallTime('12:00'), '12:00 PM')
  assert.equal(wallTime('bad'), 'bad')
})

test('calendar dates stay on the same day', () => {
  assert.equal(calendarDate('2026-10-16'), 'Fri, Oct 16, 2026')
  assert.equal(calendarDate('2026-02-30'), '2026-02-30')
})

test('plan lines follow the schedule kind', () => {
  assert.deepEqual(planLines(schedule({ slots: [{ weekday: 6, starts_at: '16:00:00', ends_at: '17:30:00' }] })), ['Sat 4:00 PM–5:30 PM'])
  assert.deepEqual(
    planLines(schedule({ kind: 'one_off', meetings: [{ occurs_on: '2026-10-16', starts_at: '10:00', ends_at: '11:00' }] })),
    ['Fri, Oct 16, 2026 10:00 AM–11:00 AM'],
  )
})

test('a whole-level audience replaces the track', () => {
  assert.equal(audienceLabel(schedule({})), 'Nine A · Grade 9 · Science')
  assert.equal(audienceLabel(schedule({ audience: 'level', group_name: null })), 'Grade 9 · Whole level')
})

test('schedules group by planned today, a hint only', () => {
  const today = schedule({ id: 'a', meets_today: true })
  const other = schedule({ id: 'b' })
  assert.deepEqual(groupSchedules([other, today]).map((s) => [s.title, s.data.map((d) => d.id)]), [
    ['Planned today', ['a']],
    ['Other schedules', ['b']],
  ])
  assert.deepEqual(groupSchedules([other]).map((s) => s.title), ['Schedules'])
})
