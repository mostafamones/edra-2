import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decodeStudent, type Part } from './api.ts'
import { student } from './testing.ts'
import * as v from './views.ts'

const part = (kind: string | null): Part => ({ id: 'p', position: 1, title: 'P', maxScore: '10', kind, questions: [] })

test('access status follows server actions', () => {
  assert.equal(v.accessStatus({ mark: true, recordWork: true, announce: true }, 'active'), null)
  assert.equal(v.accessStatus({ mark: true, recordWork: false, announce: true }, 'closed'), 'Closed · received work only')
  assert.equal(v.accessStatus({ mark: false, recordWork: false, announce: false }, 'archived'), 'Archived · read-only')
  assert.equal(v.accessStatus({ mark: false, recordWork: false, announce: false }, 'closed'), 'Read-only')
})

test('overdue only while active', () => {
  const now = Date.parse('2026-11-19T12:00:00Z')
  assert.equal(v.isOverdue('2026-11-18T00:00:00Z', 'active', now), true)
  assert.equal(v.isOverdue('2026-11-18T00:00:00Z', 'closed', now), false)
  assert.equal(v.isOverdue('2026-11-20T00:00:00Z', 'active', now), false)
  assert.equal(v.isOverdue(null, 'active', now), false)
})

test('tabs: scan only when usable and not selecting; search tab becomes the confirm button', () => {
  const panes = (t: ReturnType<typeof v.workspaceTabs>) => t.map((x) => `${x.pane}:${x.title}`)
  assert.deepEqual(panes(v.workspaceTabs(true, false, true)), ['students:Students', 'scan:Scan', 'search:Search'])
  assert.deepEqual(panes(v.workspaceTabs(true, true, true)), ['students:Students', 'search:Announce selected'])
  assert.deepEqual(panes(v.workspaceTabs(false, false, false)), ['students:Students'])
  assert.equal(v.tabAction('search', true), 'review')
  assert.equal(v.tabAction('search', false), 'switch')
  assert.equal(v.tabAction('students', true), 'switch')
})

test('row wording', () => {
  assert.equal(v.statusTone('Announced'), 'green')
  assert.equal(v.statusTone('Correction pending'), 'orange')
  assert.equal(v.statusTone('Partial · correction pending'), 'secondary')
  assert.equal(v.studentsEmptyTitle('', 'all'), 'No students')
  assert.equal(v.studentsEmptyTitle('am', 'all'), 'No matching students')
  assert.equal(v.studentsEmptyTitle('', 'marked'), 'No matching students')
  assert.equal(v.countLabel(1), '1 student')
  assert.equal(v.countLabel(3), '3 students')
})

test('announce states', () => {
  const s = decodeStudent(student())
  const command = { key: 'k', body: { items: [] } } as never
  const rejected = { id: 'k', students: [s], command, direct: false, state: { status: 'rejected', message: 'Nothing', reasons: { s1: 'Not fully marked' } } } as const
  assert.equal(v.rejection(rejected, s), 'Not fully marked')
  assert.equal(v.announceDone(rejected.state), true)
  assert.equal(v.announceStatus(rejected.state), 'Nothing')
  assert.equal(v.announceStatus({ status: 'sending' }), null)
  assert.equal(v.announceDone({ status: 'uncertain', message: 'x' }), false)
})

test('a direct announcement shows the sheet only for an outcome; a batch is always reviewed', () => {
  const s = decodeStudent(student())
  const command = { key: 'k', body: { items: [] } } as never
  const at = (direct: boolean, state: Parameters<typeof v.announceStatus>[0]) => v.showsAnnounceSheet({ id: 'k', students: [s], command, direct, state })
  assert.equal(v.showsAnnounceSheet(null), false)
  assert.equal(at(true, { status: 'reviewing' }), false)
  assert.equal(at(true, { status: 'sending' }), false)
  assert.equal(at(true, { status: 'uncertain', message: 'x' }), true)
  assert.equal(at(true, { status: 'failed', message: 'x' }), true)
  assert.equal(at(false, { status: 'reviewing' }), true)
  assert.equal(at(false, { status: 'sending' }), true)
})

test('marking wording and quick bar', () => {
  assert.equal(v.questionRange(1, 5, 2, 7), 'Questions 6–7 of 7')
  assert.equal(v.enteredText(3, 7, null, '14'), '3 of 7 entered')
  assert.equal(v.enteredText(3, 7, '4.5', '14.00'), '3 of 7 entered · 4.5 / 14')
  assert.equal(v.showsQuickBar(true, 'fast', part(null)), true)
  assert.equal(v.showsQuickBar(true, 'byQuestion', part('file_upload')), true)
  assert.equal(v.showsQuickBar(true, 'byQuestion', part('answer_sheet')), false)
  assert.equal(v.showsQuickBar(false, 'fast', part(null)), false)
  assert.equal(v.leaveTitle('Amal'), 'Save changes for Amal?')
  assert.equal(v.replaceMessage(['Written', 'Legacy']), 'Saving replaces the saved Written, Legacy marks entered the other way.')
})

test('workspace row label: name, code, score and status; never the group', () => {
  const s = decodeStudent(student())
  const label = v.studentRowLabel(s, '10', 'Marked')
  assert.ok(label.startsWith(`${s.fullName}, 0001, `), label)
  assert.ok(label.endsWith(' of 10, Marked'), label)
  assert.ok(!label.includes('Nine A'), label)
  assert.equal(v.studentRowLabel({ ...s, studentCode: null }, '10', 'Marked').split(', ').length, 3)
})
