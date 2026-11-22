import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'
import { errorJSON } from '../../core/testing.ts'
import { AssignmentsModel } from '../assignments/assignments.ts'
import { DETAIL, Harness, page as marksPage, student, summary } from '../assignments/testing.ts'
import { WorkspaceModel } from '../assignments/workspace.ts'
import { accessLabel, decodeAssessmentPage, decodeAttendancePage, rateLabel } from './api.ts'
import { StudentDirectoryModel } from './directory.ts'
import { NOT_AVAILABLE, StudentRecordModel, UNSUPPORTED } from './record.ts'

const tick = async (n = 10) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r))
}

// Settles every request a test left pending so the client's 20 s timeout doesn't hold the run open.
const harnesses: Harness[] = []
const track = () => {
  const h = new Harness()
  harnesses.push(h)
  return h
}
afterEach(() => {
  for (const h of harnesses.splice(0)) for (let i = 0; i < h.fetch.calls.length; i++) h.fetch.fail(i)
})

const YEAR = { id: 'y', start_year: 2030, closed: false }
const row = (id: string, name = id) => ({
  id, full_name: name, level_name: 'Third Preparatory', track_name: null, group_name: 'Nine A',
  participation_type: 'in_person', archived: false, online_account: 'not_connected',
})
const dir = (rows: unknown[], total = rows.length, year: unknown = YEAR) => JSON.stringify({ academic_year: year, total, page: 0, page_size: 50, students: rows })
const counts = { present: 0, late: 0, absent: 0, excused: 0, unknown: 0 }
const attendance = (o: Record<string, unknown> = {}) => JSON.stringify({
  academic_year_id: 'y', total: 0, mandatory: { ...counts, rate: null }, optional: { ...counts, attended: 0 }, items: [], limit: 50, offset: 0, ...o,
})
const item = (id: string, o: Record<string, unknown> = {}) => ({
  id, kind: 'assignment', title: id, created_at: '2030-01-01T00:00:00Z', status: 'unannounced', result: null,
  marking: { complete: true, score: '5', maximum: '10' }, ...o,
})
const assessments = (items: unknown[], total = items.length) => JSON.stringify({ academic_year_id: 'y', kind: 'assignment', total, items, limit: 25, offset: 0 })
const detail = JSON.stringify({
  id: 'r1', full_name: 'Amal', student_phone: '+201001234567', parent_phone: '+201001234568', academic_year: YEAR, level_id: 'l',
  level_name: 'Third Preparatory', track_name: null, group_name: null, participation_type: 'online_only', archived: true, archived_at: 'x',
  online_account: 'not_connected', manually_suspended: true,
})

describe('decoding and display', () => {
  test('a null rate stays distinct from 0%, and excused/unknown are reported separately', () => {
    const none = decodeAttendancePage(JSON.parse(attendance({ mandatory: { ...counts, excused: 2, unknown: 1, rate: null } })))
    assert.equal(none.mandatory.rate, null)
    assert.equal(rateLabel(none.mandatory.rate), 'No rate')
    assert.equal(none.mandatory.excused, 2)
    const zero = decodeAttendancePage(JSON.parse(attendance({ mandatory: { ...counts, absent: 3, rate: 0 } })))
    assert.equal(rateLabel(zero.mandatory.rate), '0%')
    assert.equal(rateLabel(200 / 3), '66.7%')
    assert.throws(() => decodeAttendancePage(JSON.parse(attendance({ mandatory: { ...counts, rate: 140 } }))))
  })

  test('a recorded zero is a result; missing work has none; private marking stays separate', () => {
    const page = decodeAssessmentPage(JSON.parse(assessments([
      item('zero', { status: 'announced', result: { score: '0', maximum: '10', percentage: '0', announced_at: 'x' } }),
      item('missing', { status: 'missing', marking: { complete: false, score: null, maximum: '10' } }),
      item('pending', { status: 'correction_pending', result: { score: '7.5', maximum: '12', percentage: '62.5', announced_at: 'x' }, marking: { complete: true, score: '9', maximum: '12' } }),
    ])))
    assert.equal(page.items[0]!.result?.score, '0')
    assert.equal(page.items[1]!.result, null)
    assert.equal(page.items[2]!.result?.score, '7.5')
    assert.equal(page.items[2]!.marking.score, '9')
  })

  test('an unconnected, manually suspended student reads as suspended without a connected account', () => {
    assert.equal(accessLabel({ onlineAccount: 'not_connected', manuallySuspended: true }), 'Not connected · Suspended')
    assert.equal(accessLabel({ onlineAccount: 'not_connected', manuallySuspended: false }), 'Not connected')
    assert.equal(accessLabel({ onlineAccount: 'suspended', manuallySuspended: false }), 'Suspended')
  })
})

describe('directory', () => {
  test('a stale search response never replaces the newer one', async () => {
    const h = track()
    const model = new StudentDirectoryModel(h.env)
    void model.load(h.context)
    await h.fetch.waitFor(1)
    h.fetch.respond(0, 200, dir([row('a')]))
    await tick()
    void model.setSearch('am')
    void model.setSearch('amal')
    await h.fetch.waitFor(3)
    assert.equal(h.path(2).searchParams.get('search'), 'amal')
    h.fetch.respond(2, 200, dir([row('amal')]))
    await tick()
    h.fetch.respond(1, 200, dir([row('am1'), row('am2')]))
    await tick()
    assert.deepEqual(model.students.map((s) => s.id), ['amal'])
  })

  test('filters reset paging; pages deduplicate and never overlap', async () => {
    const h = track()
    const model = new StudentDirectoryModel(h.env)
    void model.load(h.context)
    await h.fetch.waitFor(1)
    h.fetch.respond(0, 200, dir([row('a'), row('b')], 120))
    await tick()
    void model.loadMore()
    void model.loadMore()
    await h.fetch.waitFor(2)
    await tick()
    assert.equal(h.fetch.calls.length, 2, 'one page request at a time')
    assert.equal(h.path(1).searchParams.get('page'), '1')
    h.fetch.respond(1, 200, dir([row('b'), row('c')], 120))
    await tick()
    assert.deepEqual(model.students.map((s) => s.id), ['a', 'b', 'c'])
    void model.setStatus('archived')
    await h.fetch.waitFor(3)
    assert.equal(h.path(2).searchParams.get('page'), '0')
    assert.equal(h.path(2).searchParams.get('status'), 'archived')
    assert.equal(model.students.length, 0)
  })

  test('A → B → A is a new context: earlier answers and rows are dropped', async () => {
    const h = track()
    const model = new StudentDirectoryModel(h.env)
    void model.load(h.context)
    await h.fetch.waitFor(1)
    const b = h.selection.select('B')!
    void model.load(b)
    const a2 = h.selection.select('A')!
    void model.load(a2)
    await h.fetch.waitFor(3)
    h.fetch.respond(0, 200, dir([row('old-a')]))
    h.fetch.respond(1, 200, dir([row('b')]))
    await tick()
    assert.equal(model.students.length, 0)
    h.fetch.respond(2, 200, dir([row('new-a')]))
    await tick()
    assert.deepEqual(model.students.map((s) => s.id), ['new-a'])
  })

  test('sign-out drops a late answer', async () => {
    const h = track()
    const model = new StudentDirectoryModel(h.env)
    void model.load(h.context)
    await h.fetch.waitFor(1)
    h.scope.end()
    await tick()
    assert.equal(model.students.length, 0)
  })

  test('membership loss clears the academy data and revalidates; a refresh failure keeps the same context rows', async () => {
    const h = track()
    const model = new StudentDirectoryModel(h.env)
    void model.load(h.context)
    await h.fetch.waitFor(1)
    h.fetch.respond(0, 200, dir([row('a')]))
    await tick()
    void model.refresh()
    await h.fetch.waitFor(2)
    h.fetch.respond(1, 500, errorJSON('INTERNAL'))
    await tick()
    assert.deepEqual(model.students.map((s) => s.id), ['a'])
    assert.ok(model.refreshError)
    void model.refresh()
    await h.fetch.waitFor(3)
    h.fetch.respond(2, 403, errorJSON('FORBIDDEN'))
    await tick()
    assert.equal(model.students.length, 0)
    assert.equal(model.state.status, 'idle')
    assert.equal(h.forbidden.length, 1)
  })

  test('a server without the endpoint is unsupported, not empty; no open year is explicit', async () => {
    const h = track()
    const model = new StudentDirectoryModel(h.env)
    void model.load(h.context)
    await h.fetch.waitFor(1)
    h.fetch.respond(0, 404, '<html>Not found</html>')
    await tick()
    assert.equal(model.state.status, 'unsupported')
    void model.refresh()
    await h.fetch.waitFor(2)
    h.fetch.respond(1, 200, dir([], 0, null))
    await tick()
    assert.equal(model.state.status, 'noYear')
  })
})

describe('record', () => {
  const open = () => {
    const h = track()
    const model = new StudentRecordModel('r1', h.context, h.env)
    void model.load()
    return { h, model }
  }
  const byPath = (h: Harness, suffix: string) => h.fetch.calls.findIndex((c) => new URL(c.url).pathname.endsWith(suffix))

  test('sections fail and retry independently', async () => {
    const { h, model } = open()
    await h.fetch.waitFor(3)
    h.fetch.respond(byPath(h, '/r1'), 200, detail)
    h.fetch.respond(byPath(h, '/attendance'), 500, errorJSON('INTERNAL'))
    h.fetch.respond(byPath(h, '/assessments'), 200, assessments([item('a')]))
    await tick()
    assert.equal(model.detail?.fullName, 'Amal')
    assert.equal(model.attendance.state.status, 'failed')
    assert.equal(model.assessments.items.length, 1)
    void model.loadAttendance()
    await h.fetch.waitFor(4)
    h.fetch.respond(3, 200, attendance({ total: 1, mandatory: { ...counts, present: 1, rate: 100 } }))
    await tick()
    assert.equal(model.attendance.summary?.mandatory.rate, 100)
    assert.equal(model.detail?.fullName, 'Amal')
  })

  test('the assessment type filter is sent to the server and each type pages from zero', async () => {
    const { h, model } = open()
    await h.fetch.waitFor(3)
    assert.equal(h.path(byPath(h, '/assessments')).searchParams.get('kind'), 'assignment')
    void model.setKind('quiz')
    await h.fetch.waitFor(4)
    assert.equal(h.path(3).searchParams.get('kind'), 'quiz')
    assert.equal(h.path(3).searchParams.get('offset'), '0')
    // The assignment page answering late must not appear under Quizzes.
    h.fetch.respond(byPath(h, '/assessments'), 200, assessments([item('late-assignment')]))
    h.fetch.respond(3, 200, assessments([item('q', { kind: 'quiz' })], 30))
    await tick()
    assert.deepEqual(model.assessments.items.map((i) => i.id), ['q'])
    void model.loadMoreAssessments()
    await h.fetch.waitFor(5)
    assert.equal(h.path(4).searchParams.get('offset'), '1')
  })

  test('a missing or foreign record is unavailable; an old server is unsupported', async () => {
    const { h, model } = open()
    await h.fetch.waitFor(3)
    h.fetch.respond(byPath(h, '/r1'), 404, errorJSON('NOT_FOUND'))
    h.fetch.respond(byPath(h, '/attendance'), 404, 'Not found')
    await tick()
    assert.deepEqual(model.detailState, { status: 'failed', message: NOT_AVAILABLE })
    assert.deepEqual(model.attendance.state, { status: 'failed', message: UNSUPPORTED })
  })

  test('a record from another academy context never commits', async () => {
    const { h, model } = open()
    await h.fetch.waitFor(3)
    h.selection.select('B')
    h.fetch.respond(byPath(h, '/r1'), 200, detail)
    await tick()
    assert.equal(model.detail, null)
  })
})

describe('assignment workspace from a student record', () => {
  test('opens the focused annual record found through the server search', async () => {
    const h = track()
    const parent = new AssignmentsModel(h.env)
    const workspace = new WorkspaceModel(summary, h.context, parent, { recordId: 's2', name: 'Amal' })
    void workspace.load()
    await h.fetch.waitFor(1)
    h.fetch.respond(0, 200, DETAIL)
    await h.fetch.waitFor(2)
    h.fetch.respond(1, 200, marksPage([student('s1')]))
    await h.fetch.waitFor(3)
    assert.equal(h.path(2).searchParams.get('search'), 'Amal')
    h.fetch.respond(2, 200, marksPage([student('s1', { name: 'Amal' }), student('s2', { name: 'Amal' })]))
    await tick()
    assert.equal(workspace.marking?.student.id, 's2')
    assert.equal(parent.activeMarking, workspace.marking)
  })

  test('a student who is not a recipient opens nothing and says so', async () => {
    const h = track()
    const workspace = new WorkspaceModel(summary, h.context, new AssignmentsModel(h.env), { recordId: 'zz', name: 'Amal' })
    void workspace.load()
    await h.fetch.waitFor(1)
    h.fetch.respond(0, 200, DETAIL)
    await h.fetch.waitFor(2)
    h.fetch.respond(1, 200, marksPage([]))
    await h.fetch.waitFor(3)
    h.fetch.respond(2, 200, marksPage([student('s1')]))
    await tick()
    assert.equal(workspace.marking, null)
    assert.match(workspace.notice ?? '', /isn't on this assignment's list/)
  })
})
