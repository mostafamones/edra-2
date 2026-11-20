// Run: node --test mobile/react-native/src/features/sessions/*.test.ts (Node ≥ 22.18, no dependencies).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AttendanceEntry, AttendanceSheet, LiveSession, StartableSchedule } from './contract.ts'
import {
  LiveSessionsModel,
  normalizeCode,
  parseLateAfter,
  SchedulesModel,
  SessionDetailModel,
  StartSessionModel,
  writeOutcome,
  type AcademyContext,
  type APIError,
  type RequestOptions,
  type RequestPort,
  type Result,
} from './index.ts'

// A transport the test completes in any order.
interface Call {
  method: 'GET' | 'POST' | 'PATCH'
  path: string
  body?: unknown
  options?: RequestOptions
  resolve(result: Result<unknown>): void
}

function fakeApi() {
  const calls: Call[] = []
  const request = (method: Call['method']) => (path: string, a?: unknown, b?: RequestOptions) =>
    new Promise<Result<any>>((resolve) => {
      calls.push(method === 'GET' ? { method, path, options: a as RequestOptions, resolve } : { method, path, body: a, options: b, resolve })
    })
  const api: RequestPort = { get: request('GET'), post: request('POST'), patch: request('PATCH') }
  return { api, calls }
}

const ok = (value: unknown): Result<unknown> => ({ ok: true, value })
const fail = (error: APIError): Result<unknown> => ({ ok: false, error })
const rejected = (status: number, code: string, details?: unknown): Result<unknown> =>
  fail({ kind: 'rejected', failure: { status, code, message: `server ${code}`, details } })
const tick = () => new Promise((r) => setImmediate(r))

function owner() {
  const log: string[] = []
  return { log, owner: { onUnauthenticated: () => void log.push('signOut'), onForbidden: () => void log.push('forbidden') } }
}

let keyCounter = 0
const newKey = () => `key-${++keyCounter}`

const entry = (id: string, patch: Partial<AttendanceEntry> = {}): AttendanceEntry => ({
  annual_student_record_id: id,
  full_name: `Student ${id}`,
  student_code: id.toUpperCase(),
  origin: 'expected',
  status: 'unknown',
  checked_in_at: null,
  version: 0,
  published_status: null,
  correction_pending: false,
  ...patch,
})

const sheet = (revision: number, patch: Partial<AttendanceSheet> = {}): AttendanceSheet => ({
  session: { mandatory: true, state: 'live', archived_at: null, year_open: true, metadata_version: 1 },
  student_codes_enabled: true,
  revision,
  published_revision: null,
  publication_count: 0,
  publication: 'unpublished',
  permitted_actions: { check_in: true, edit: true, publish: true },
  counts: { unknown: 0, present: 0, late: 0, absent: 0, excused: 0, total: 0 },
  entries: [entry('a'), entry('b', { origin: 'unexpected' }), entry('c', { status: 'present', version: 1, checked_in_at: '2026-10-05T14:03:11Z' })],
  ...patch,
})

const session: LiveSession = {
  id: 's1', academy_id: 'acad', academy_name: 'Magd', schedule_title: 'Physics', group_name: null, level_name: null,
  track_name: null, location: null, state: 'live', started_at: '2026-10-05T14:00:00Z', started_by_name: null,
  auto_end_at: '2026-10-05T15:30:00Z', roster_count: 3,
}

async function loadedDetail(revision = 5, patch: Partial<AttendanceSheet> = {}, current = { value: true }) {
  const { api, calls } = fakeApi()
  const o = owner()
  const store = new Map<string, number>()
  const model = new SessionDetailModel(session, {
    api, isCurrent: () => current.value, owner: o.owner, newKey,
    lateAfter: { get: (id) => store.get(id), set: (id, m) => void store.set(id, m) },
  })
  const load = model.load()
  calls.shift()!.resolve(ok(sheet(revision, patch)))
  await load
  return { model, calls, log: o.log, store, current }
}

// Settles the pending write and the sheet reload that follows it.
async function settle(calls: Call[], pending: Promise<unknown>, result: Result<unknown>, reload?: AttendanceSheet) {
  calls.shift()!.resolve(result)
  await tick()
  if (reload) calls.shift()!.resolve(ok(reload))
  await pending
}

// MARK: Write outcome policy

test('uncertain vs definitive write outcomes', () => {
  assert.equal(writeOutcome({ kind: 'network' }).kind, 'uncertain')
  assert.equal(writeOutcome({ kind: 'server', message: 'x' }).kind, 'uncertain')
  assert.equal(writeOutcome({ kind: 'rejected', failure: { status: 429, code: 'THROTTLED', message: '' } }).kind, 'uncertain')
  assert.equal(writeOutcome({ kind: 'rejected', failure: { status: 500, code: 'INTERNAL', message: '' } }).kind, 'uncertain')
  assert.equal(writeOutcome({ kind: 'rejected', failure: { status: 200, code: 'UNREADABLE_RESPONSE', message: '' } }).kind, 'uncertain')
  assert.equal(writeOutcome({ kind: 'rejected', failure: { status: 409, code: 'ATTENDANCE_CONFLICT', message: '' } }).kind, 'rejected')
  assert.equal(writeOutcome({ kind: 'cancelled' }).kind, 'cancelled')
})

test('code normalization and late deadline parsing', () => {
  assert.equal(normalizeCode('  0042-ab '), '0042-AB')
  assert.equal(normalizeCode('a b'), null)
  assert.equal(normalizeCode('x'.repeat(21)), null)
  assert.equal(normalizeCode('٠٤'), null)
  assert.equal(parseLateAfter(''), 0)
  assert.equal(parseLateAfter('1440'), 1440)
  assert.equal(parseLateAfter('1441'), null)
  assert.equal(parseLateAfter('-1'), null)
  assert.equal(parseLateAfter('1.5'), null)
})

// MARK: Live sessions and schedules

const ctx = (academyId: string, epoch: number): AcademyContext => ({ academyId, epoch })

test('live list keeps the newest load and ignores stale authority failures', async () => {
  const { api, calls } = fakeApi()
  const o = owner()
  let current = ctx('A', 1)
  const model = new LiveSessionsModel({ api, isCurrent: (c) => c.epoch === current.epoch, owner: o.owner })
  const first = model.load(ctx('A', 1))
  current = ctx('B', 2)
  const second = model.load(ctx('B', 2))
  assert.equal(calls[0].path, 'api/v1/academies/A/sessions?state=live')
  calls[1].resolve(ok({ sessions: [session], next_cursor: null }))
  await second
  calls[0].resolve(fail({ kind: 'forbidden' }))
  await first
  assert.deepEqual(model.sessions, [session])
  assert.deepEqual(o.log, [])
})

test('schedule search pages append and an older search cannot overwrite a newer one', async () => {
  const { api, calls } = fakeApi()
  const model = new SchedulesModel({ api, isCurrent: () => true, owner: owner().owner })
  const s = (id: string) => ({ id, title: id }) as StartableSchedule
  const older = model.load(ctx('A', 1), 'phy')
  const newer = model.load(ctx('A', 1), 'a&b=c')
  assert.match(calls[1].path, /&q=a%26b%3Dc$/)
  calls[1].resolve(ok({ time_zone: 'Africa/Cairo', today: '2026-10-05', academic_year: { id: 'y', start_year: 2026 }, schedules: [s('1')], next_offset: 50 }))
  await newer
  calls[0].resolve(ok({ time_zone: 'UTC', today: '', academic_year: null, schedules: [s('old')], next_offset: null }))
  await older
  assert.deepEqual(model.schedules.map((x) => x.id), ['1'])
  assert.equal(model.hasOpenYear, true)
  const more = model.loadMore()
  assert.match(calls[2].path, /offset=50/)
  calls[2].resolve(ok({ time_zone: 'Africa/Cairo', today: '', academic_year: { id: 'y', start_year: 2026 }, schedules: [s('1'), s('2')], next_offset: null }))
  await more
  assert.deepEqual(model.schedules.map((x) => x.id), ['1', '2'])
  assert.equal(model.hasMore, false)
})

// MARK: Start / open

function startModel(current = { epoch: 1 }) {
  const { api, calls } = fakeApi()
  const o = owner()
  const started: string[] = []
  const model = new StartSessionModel({
    api, isCurrent: (c) => c.epoch === current.epoch, owner: o.owner, newKey, onStarted: (c) => void started.push(c.academyId),
  })
  return { model, calls, log: o.log, started, current }
}
const schedule = (id: string) => ({ id, title: `Schedule ${id}` }) as StartableSchedule
const startedBody = (outcome: string, academy = 'A') => ok({ outcome, replayed: outcome === 'replayed', session: { ...session, academy_id: academy } })

test('lost start response is uncertain and Retry reuses the key; a different schedule is a new start', async () => {
  const { model, calls, started } = startModel()
  model.presentPicker()
  let p = model.start(schedule('x'), 'Magd', ctx('A', 1))
  void model.start(schedule('x'), 'Magd', ctx('A', 1)) // double tap
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].body, { schedule_id: 'x' })
  const key = calls[0].options?.idempotencyKey
  calls.shift()!.resolve(fail({ kind: 'network' }))
  await p
  assert.equal(model.phase.kind, 'uncertain')
  p = model.start(schedule('x'), 'Magd', ctx('A', 1))
  assert.equal(calls[0].options?.idempotencyKey, key)
  calls.shift()!.resolve(startedBody('replayed'))
  await p
  assert.deepEqual(started, ['A'])
  assert.equal(model.destination?.id, 's1')
  assert.equal(model.isPickerPresented, false)

  p = model.start(schedule('y'), 'Magd', ctx('A', 1))
  const yKey = calls[0].options?.idempotencyKey
  assert.notEqual(yKey, key)
  calls.shift()!.resolve(fail({ kind: 'network' }))
  await p
  p = model.start(schedule('z'), 'Magd', ctx('A', 1)) // a different schedule is a new logical start
  assert.notEqual(calls[0].options?.idempotencyKey, yKey)
  calls.shift()!.resolve(startedBody('existing'))
  await p
  assert.equal(model.attempt, null)
})

test('late start success after picker dismissal only refreshes; after academy change touches nothing', async () => {
  const { model, calls, started, current, log } = startModel()
  model.presentPicker()
  let p = model.start(schedule('x'), 'Magd', ctx('A', 1))
  model.dismissPicker()
  calls.shift()!.resolve(startedBody('started'))
  await p
  assert.equal(model.destination, null)
  assert.deepEqual(started, ['A'])

  p = model.start(schedule('x'), 'Magd', ctx('A', 1))
  current.epoch = 2
  model.reset()
  calls.shift()!.resolve(fail({ kind: 'unauthenticated' }))
  await p
  assert.deepEqual(log, [])
  assert.equal(model.attempt, null)
})

test('forbidden start clears retry state and revalidates', async () => {
  const { model, calls, log } = startModel()
  const p = model.start(schedule('x'), 'Magd', ctx('A', 1))
  calls.shift()!.resolve(fail({ kind: 'forbidden' }))
  await p
  assert.equal(model.attempt, null)
  assert.deepEqual(log, ['forbidden'])
})

// MARK: Roster, revision and state

test('out-of-order sheet loads keep the newest; lower revision dropped unless lifecycle changed', async () => {
  const { model, calls } = await loadedDetail(5)
  const a = model.load()
  const b = model.load()
  calls[1].resolve(ok(sheet(7)))
  await b
  calls[0].resolve(ok(sheet(9)))
  await a
  assert.equal(model.sheet?.revision, 7)
  calls.splice(0)

  let p = model.load()
  calls.splice(0)[0]!.resolve(ok(sheet(6)))
  await p
  assert.equal(model.sheet?.revision, 7)
  p = model.load()
  const archived = sheet(6, { session: { mandatory: true, state: 'ended', archived_at: '2026-10-06T00:00:00Z', year_open: true, metadata_version: 2 } })
  calls.splice(0)[0]!.resolve(ok(archived))
  await p
  assert.equal(model.isArchived, true)
})

test('background refresh failure keeps the sheet with a problem; stale owner ignores failures', async () => {
  const { model, calls, current, log } = await loadedDetail(5)
  let p = model.load()
  calls.shift()!.resolve(fail({ kind: 'network' }))
  await p
  assert.equal(model.sheet?.revision, 5)
  assert.ok(model.refreshProblem)
  p = model.load()
  current.value = false
  calls.shift()!.resolve(fail({ kind: 'forbidden' }))
  await p
  assert.deepEqual(log, [])
  assert.equal(model.sheet?.revision, 5)
})

test('derived roster state', async () => {
  const { model } = await loadedDetail(5, { publication: 'pending_corrections' })
  assert.equal(model.official, 'correctionsPending')
  assert.deepEqual(model.checkedIn.map((e) => e.annual_student_record_id), ['c'])
  const visible = () => model.visibleEntries.map((e) => e.annual_student_record_id)
  assert.deepEqual(visible(), ['c'])
  model.setFilter('all')
  assert.deepEqual(visible(), ['c', 'a', 'b'])
  model.setFilter('unknown')
  assert.deepEqual(visible(), ['a', 'b'])
  model.setFilter('excused')
  assert.deepEqual(visible(), [])
  model.setFilter('all')
  model.setSort('name')
  assert.deepEqual(visible(), ['a', 'b', 'c'])
  assert.equal(model.sheet?.entries.length, 3) // filtering never edits the authoritative roster
  assert.equal(model.unrecordedCount, 1) // the unexpected student is never expected
  const optional = await loadedDetail(5, { session: { mandatory: false, state: 'live' } })
  assert.equal(optional.model.unrecordedCount, 0)
  assert.equal(optional.model.canMarkRestAbsent, false)
})

// MARK: Manual status changes

test('status commands are kept per student and only the exact change is resent', async () => {
  const { model, calls } = await loadedDetail(5)
  const a = model.sheet!.entries[0]
  let p = model.changeStatus('late', a)
  assert.equal(calls[0].method, 'PATCH')
  assert.equal(calls[0].path, 'api/v1/sessions/s1/attendance/a')
  assert.deepEqual(calls[0].body, { status: 'late', expected_version: 0 })
  const key = calls[0].options?.idempotencyKey
  assert.equal(calls[0].options?.structuredErrors, true)
  calls.shift()!.resolve(rejected(503, 'INTERNAL'))
  await p
  assert.equal(model.uncertainStatus?.key, key)

  await model.changeStatus('absent', a)
  assert.equal(calls.length, 0)
  assert.match(model.statusError ?? '', /isn't confirmed yet/)

  p = model.changeStatus('late', a)
  assert.equal(calls[0].options?.idempotencyKey, key)
  await settle(calls, p, ok({ outcome: 'updated', changed: 1, entry: a, revision: 6, replayed: true }), sheet(6))
  assert.equal(model.statusCommands.size, 0)
  assert.equal(model.sheet?.revision, 6)
})

test('a conflict ends the command and refetches for review', async () => {
  const { model, calls } = await loadedDetail(5)
  const p = model.changeStatus('absent', model.sheet!.entries[0])
  await settle(calls, p, rejected(409, 'ATTENDANCE_CONFLICT', { current: entry('a', { status: 'present', version: 2 }), revision: 6 }), sheet(6))
  assert.equal(model.statusCommands.size, 0)
  assert.match(model.statusError ?? '', /Someone else changed/)
})

test('forbidden write discards every retry key and revalidates', async () => {
  const { model, calls, log } = await loadedDetail(5)
  let p = model.changeStatus('late', model.sheet!.entries[0])
  calls.shift()!.resolve(fail({ kind: 'network' }))
  await p
  model.beginFinalizeReview()
  p = model.changeStatus('late', model.sheet!.entries[1])
  calls.shift()!.resolve(fail({ kind: 'forbidden' }))
  await p
  assert.equal(model.statusCommands.size, 0)
  assert.equal(model.finalizeReview, null)
  assert.deepEqual(log, ['forbidden'])
})

// MARK: Finalize and all-remaining absence

test('finalize sends the reviewed revision, never a newer one, and retries with the same key', async () => {
  const { model, calls } = await loadedDetail(5)
  model.beginFinalizeReview()
  let r = model.load()
  calls.shift()!.resolve(ok(sheet(6)))
  await r
  assert.equal(model.finalizeReviewIsStale, true)
  await model.publish()
  assert.equal(calls.length, 0)

  model.beginFinalizeReview()
  let p = model.publish()
  assert.equal(calls[0].path, 'api/v1/sessions/s1/attendance/publications')
  assert.deepEqual(calls[0].body, { expected_revision: 6 })
  const key = calls[0].options?.idempotencyKey
  calls.shift()!.resolve(fail({ kind: 'network' }))
  await p
  assert.deepEqual(model.publishCommand, { revision: 6, key })

  r = model.load()
  calls.shift()!.resolve(ok(sheet(7)))
  await r
  p = model.publish() // the unacknowledged command is retried unchanged
  assert.deepEqual(calls[0].body, { expected_revision: 6 })
  assert.equal(calls[0].options?.idempotencyKey, key)
  await settle(calls, p, rejected(409, 'PUBLICATION_STALE'), sheet(7))
  assert.equal(model.publishCommand, null)
  assert.match(model.publishMessage ?? '', /changed after you reviewed/)
})

test('mark rest absent captures the reviewed revision and needs a fresh review after a newer save', async () => {
  const { model, calls } = await loadedDetail(5)
  assert.equal(model.canMarkRestAbsent, true)
  model.beginAbsenceReview()
  const r = model.load()
  calls.shift()!.resolve(ok(sheet(6)))
  await r
  await model.markRestAbsent()
  assert.equal(calls.length, 0)
  assert.match(model.statusError ?? '', /changed while you were reviewing/)

  model.beginAbsenceReview()
  let p = model.markRestAbsent()
  assert.equal(calls[0].path, 'api/v1/sessions/s1/attendance/unrecorded-absences')
  assert.deepEqual(calls[0].body, { expected_revision: 6 })
  calls.shift()!.resolve(rejected(409, 'ATTENDANCE_REVIEW_STALE', { revision: 7 }))
  await tick()
  calls.shift()!.resolve(ok(sheet(7)))
  await p
  assert.equal(model.absenceCommand, null)

  model.beginAbsenceReview()
  p = model.markRestAbsent()
  await settle(calls, p, ok({ outcome: 'updated', changed: 1001, revision: 8, replayed: false }), sheet(8))
  assert.equal(model.notice, '1001 students marked absent.')
})

test('late deadline is clamped and kept per session', async () => {
  const { model, store } = await loadedDetail()
  model.setLateAfter(5000)
  assert.equal(model.lateAfterMinutes, 1440)
  model.setLateAfter(-3)
  assert.equal(store.get('s1'), 0)
})

// MARK: Student-code preview and confirm

test('code preview writes nothing; confirm captures Late-after and retries the same attempt', async () => {
  const { model, calls } = await loadedDetail(5)
  model.setLateAfter(10)
  const scanner = model.makeScanner()
  scanner.recognized([' a '])
  assert.equal(scanner.state.kind, 'awaitingDecision')
  assert.equal(calls.length, 0)
  scanner.recognized(['A']) // still in view: ignored
  let p = scanner.confirm()
  void scanner.confirm() // duplicate tap
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].body, { student_id: 'A', late_after_minutes: 10 })
  const key = calls[0].options?.idempotencyKey
  calls.shift()!.resolve(fail({ kind: 'network' }))
  await p
  assert.equal(scanner.state.kind, 'uncertain')

  model.setLateAfter(0)
  const ended = model.load() // the session ended meanwhile: the attempt is still retryable
  calls.shift()!.resolve(ok(sheet(5, { session: { mandatory: true, state: 'ended', year_open: true, metadata_version: 2 } })))
  await ended
  p = scanner.confirm()
  assert.deepEqual(calls[0].body, { student_id: 'A', late_after_minutes: 10 })
  assert.equal(calls[0].options?.idempotencyKey, key)
  await settle(calls, p, ok({ outcome: 'recorded', entry: entry('a', { status: 'late' }), revision: 6, replayed: true }), sheet(6))
  assert.equal(scanner.notice, 'Student a checked in late.')
})

test('review required shows the server entry; unknown code offers add without writing', async () => {
  const { model, calls } = await loadedDetail(5)
  const scanner = model.makeScanner()
  scanner.recognized(['A'])
  const p = scanner.confirm()
  await settle(calls, p, rejected(409, 'REVIEW_REQUIRED', { entry: entry('a', { status: 'excused' }) }), sheet(5))
  assert.equal(scanner.state.kind, 'rejected')
  assert.match(scanner.state.kind === 'rejected' ? scanner.state.message : '', /marked Excused/)
  scanner.dismiss()
  scanner.recognized([])
  scanner.recognized(['ZZ9'])
  assert.deepEqual(scanner.state, { kind: 'notOnRoster', code: 'ZZ9' })
  assert.equal(calls.length, 0)
  assert.equal(scanner.canAddAttendee, true)
})

test('scanner is blocked by archive, codes off and permissions', async () => {
  const archived = await loadedDetail(5, { session: { mandatory: true, state: 'live', archived_at: 'x' } })
  assert.match(archived.model.makeScanner().blockedReason ?? '', /archived/)
  const codesOff = await loadedDetail(5, { student_codes_enabled: false })
  assert.match(codesOff.model.makeScanner().blockedReason ?? '', /codes are off/)
  const noCheckIn = await loadedDetail(5, { permitted_actions: { check_in: false, edit: false, publish: false } })
  const scanner = noCheckIn.model.makeScanner()
  scanner.recognized(['A'])
  assert.equal(scanner.state.kind, 'scanning')
})

test('stale scanner completion after a context change is ignored', async () => {
  const { model, calls, current, log } = await loadedDetail(5)
  const scanner = model.makeScanner()
  scanner.recognized(['A'])
  const p = scanner.confirm()
  current.value = false
  calls.shift()!.resolve(fail({ kind: 'unauthenticated' }))
  await p
  assert.equal(scanner.state.kind, 'submitting')
  assert.deepEqual(log, [])
})

// MARK: Add attendee

test('search then add only on explicit confirmation against the chosen revision', async () => {
  const { model, calls } = await loadedDetail(5)
  const add = model.makeAttendees('zz9')
  let p: Promise<unknown> = add.search()
  assert.equal(calls[0].path, 'api/v1/sessions/s1/attendance/attendees?q=zz9&limit=20&offset=0')
  const candidate = { annual_student_record_id: 'z', full_name: 'Zed', level_name: null, group_name: null, participation_type: 'in_person', student_code: 'ZZ9' }
  calls.shift()!.resolve(ok({ items: [candidate], has_more: false }))
  await p
  assert.equal(calls.length, 0)
  add.choose(add.items[0])
  p = add.add()
  assert.deepEqual(calls[0].body, { annual_student_record_id: 'z', expected_revision: 5 })
  const key = calls[0].options?.idempotencyKey
  calls.shift()!.resolve(fail({ kind: 'network' }))
  await p
  p = add.add()
  assert.equal(calls[0].options?.idempotencyKey, key)
  await settle(calls, p, ok({ outcome: 'added', entry: entry('z', { origin: 'unexpected' }), revision: 6, replayed: true }), sheet(6))
  assert.equal(add.added?.annual_student_record_id, 'z')
  assert.equal(add.added?.status, 'unknown') // adding never checks in
})

test('stale add review requires choosing again; 404 without a code needs a server update', async () => {
  const { model, calls } = await loadedDetail(5)
  const add = model.makeAttendees()
  add.choose({ annual_student_record_id: 'z', full_name: 'Zed', level_name: null, group_name: null, participation_type: 'in_person', student_code: null })
  let p = add.add()
  calls.shift()!.resolve(rejected(409, 'ATTENDANCE_REVIEW_STALE', { revision: 6 }))
  await tick()
  calls.shift()!.resolve(ok(sheet(6))) // sheet refresh
  await tick()
  calls.shift()!.resolve(ok({ items: [], has_more: false })) // search refresh
  await p
  assert.equal(add.chosen, null)
  assert.match(add.message ?? '', /Choose the student again/)

  p = add.search()
  calls.shift()!.resolve(rejected(404, 'UNCODED_ERROR'))
  await p
  assert.deepEqual(add.phase, { kind: 'failed', message: "This server doesn't support this action yet. It needs an update." })
})
