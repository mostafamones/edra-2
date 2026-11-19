// Run: node --test mobile/react-native/src/app/*.test.ts (Node ≥ 22.18, no dependencies).
// The real AcademiesController, sessions/assignments models and ApiClient over a routed fake fetch.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiClient } from '../core/api.ts'
import { AccountScope } from '../core/ownership.ts'
import type { MarkingModel } from '../features/assignments/marking.ts'
import type { LiveSession } from '../features/sessions/contract.ts'
import type { LateAfterStore } from '../features/sessions/detail.ts'
import { academyIcon, Shell } from './shell.ts'

const tick = async (n = 20) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r))
}

const academy = (id: string) => ({ id, name: `Academy ${id}`, slug: id, icon: 'book', role: 'instructor' })
const live = (id: string, academyId = 'a'): LiveSession => ({
  id, academy_id: academyId, academy_name: `Academy ${academyId}`, schedule_title: 'Physics', group_name: null, level_name: null,
  track_name: null, location: null, state: 'live', started_at: '2026-11-19T08:00:00Z', started_by_name: null,
  auto_end_at: '2026-11-19T10:00:00Z', roster_count: 0,
})

function setup(options: { remembered?: string | null } = {}) {
  const requests: string[] = []
  const server = {
    academies: [academy('a'), academy('b')],
    status: new Map<string, number>(),
    started: null as LiveSession | null,
  }
  const fetch = async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname.replace(/^\//, '')
    requests.push(`${init.method} ${path}`)
    const status = [...server.status].find(([prefix]) => path.startsWith(prefix))?.[1]
    if (status) return new Response(JSON.stringify({ error: { code: 'X', message: 'm' } }), { status })
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
    if (path === 'api/v1/academies') return json({ academies: server.academies })
    if (/sessions$/.test(path) && init.method === 'GET') return json({ sessions: [], next_cursor: null })
    if (/sessions$/.test(path) && init.method === 'POST') return json({ session: server.started })
    if (path.includes('/schedules')) return json({ schedules: [], next_offset: null, academic_year: null, time_zone: 'Africa/Cairo' })
    if (path.includes('/assignments')) return json({ total: 0, assignments: [] })
    return new Response('{}', { status: 404 })
  }
  let id = 0
  const client = new ApiClient({ origin: 'https://api.example.test/', auth: { accessToken: async () => 'token' }, fetch, newId: () => `id-${++id}` })
  const scope = new AccountScope()
  const signOuts: string[] = []
  const auth = {
    signOut: async () => void signOuts.push('user'),
    signOutFrom: async (s: AccountScope) => void signOuts.push(s === scope && s.isActive ? 'scope' : 'stale'),
  }
  const writes: string[] = []
  const selection = { read: () => options.remembered ?? null, write: (a: string) => void writes.push(a), clear: () => {} }
  const late = new Map<string, Map<string, number>>()
  const lateDeadlines = (academyId: string): LateAfterStore => {
    const store = late.get(academyId) ?? late.set(academyId, new Map()).get(academyId)!
    return { get: (s) => store.get(s), set: (s, m) => void store.set(s, m) }
  }
  const shell = new Shell({ auth, scope, client, selection, services: { fetch, newId: () => `key-${++id}`, lateDeadlines } })
  const count = (pattern: string) => requests.filter((r) => r === pattern).length
  return { shell, server, requests, count, scope, signOuts, writes, late }
}

test('mount selects the remembered granted academy and loads every academy-scoped list for it', async () => {
  const { shell, requests, writes } = setup({ remembered: 'b' })
  await shell.academies.load()
  await tick()
  assert.equal(shell.academies.selected?.id, 'b')
  assert.deepEqual(writes, ['b'])
  assert.ok(requests.includes('GET api/v1/academies/b/sessions'))
  assert.ok(requests.some((r) => r.startsWith('GET api/v1/academies/b/schedules')))
  assert.ok(requests.some((r) => r.startsWith('GET api/v1/academies/b/assignments')))
  assert.equal(shell.sessions.state.kind, 'loaded')
  assert.equal(shell.assignments.state.status, 'loaded')
})

test('an academy change returns to Sessions, clears both histories and the start flow; reselection keeps them', async () => {
  const { shell, requests } = setup()
  await shell.academies.load()
  await tick()
  shell.openSession(live('s1'))
  shell.selectTab('assessments')
  shell.start.presentPicker()

  assert.equal(shell.chooseAcademy('a'), null)
  assert.equal(shell.sessionsPath.length, 1)
  assert.equal(shell.tab, 'assessments')

  shell.openMenu()
  assert.equal(shell.chooseAcademy('b'), null)
  assert.equal(shell.menuOpen, false)
  assert.equal(shell.tab, 'sessions')
  assert.deepEqual(shell.sessionsPath, [])
  assert.equal(shell.start.isPickerPresented, false)
  await tick()
  assert.ok(requests.includes('GET api/v1/academies/b/sessions'))
  assert.equal(shell.assignments.context?.academyId, 'b')
})

test('tab histories are independent; popping to the root refreshes the live list', async () => {
  const { shell, count } = setup()
  await shell.academies.load()
  await tick()
  shell.openSession(live('s1'))
  shell.openSession(live('s2'))
  shell.selectTab('assessments')
  shell.selectTab('sessions')
  assert.deepEqual(shell.sessionsPath.map((r) => r.session.id), ['s1', 's2'])
  const before = count('GET api/v1/academies/a/sessions')
  shell.popSessions(1)
  await tick()
  assert.equal(count('GET api/v1/academies/a/sessions'), before)
  shell.popSessions(0)
  await tick()
  assert.equal(count('GET api/v1/academies/a/sessions'), before + 1)
})

test('an acknowledged start pushes the server session on Sessions, replacing the history', async () => {
  const { shell, server } = setup()
  await shell.academies.load()
  await tick()
  shell.openSession(live('old'))
  shell.selectTab('assessments')
  server.started = live('new')
  shell.start.presentPicker()
  const context = shell.academies.context!
  await shell.start.start({ id: 'sch', title: 'Physics' } as never, 'Academy a', context)
  await tick()
  assert.equal(shell.tab, 'sessions')
  assert.deepEqual(shell.sessionsPath.map((r) => r.session.id), ['new'])
  assert.equal(shell.start.destination, null)
  // The same session pushed again is a new screen.
  shell.openSession(live('new'))
  assert.notEqual(shell.sessionsPath[0]!.key, shell.sessionsPath[1]!.key)
})

test('401 signs out only this scope; 403 revalidates academies and a revoked academy resets the shell', async () => {
  const { shell, server, signOuts, count } = setup()
  await shell.academies.load()
  await tick()
  shell.openSession(live('s1'))

  server.status.set('api/v1/academies/a/sessions', 401)
  await shell.sessions.load(shell.academies.context)
  await tick()
  assert.deepEqual(signOuts, ['scope'])

  server.status.set('api/v1/academies/a/sessions', 403)
  server.academies = [academy('b')]
  const loads = count('GET api/v1/academies')
  await shell.sessions.load(shell.academies.context)
  await tick()
  assert.equal(count('GET api/v1/academies'), loads + 1)
  assert.equal(shell.academies.selected?.id, 'b')
  assert.deepEqual(shell.sessionsPath, [])
})

test('foreground revalidates access and refreshes live sessions only for an unchanged academy', async () => {
  const { shell, server, count } = setup()
  await shell.academies.load()
  await tick()
  const sessionsA = count('GET api/v1/academies/a/sessions')
  await shell.foreground()
  await tick()
  assert.equal(count('GET api/v1/academies/a/sessions'), sessionsA + 1)

  server.academies = [academy('b')]
  await shell.foreground()
  await tick()
  assert.equal(count('GET api/v1/academies/a/sessions'), sessionsA + 1)
  assert.equal(shell.academies.selected?.id, 'b')
})

function dirtyMarking(saves: boolean) {
  const marking = { hasChanges: true, canRequestSave: true, saved: 0, discarded: 0, save: async () => (marking.saved++, saves), discard: () => void marking.discarded++ }
  return marking
}

test('switching away from unsaved marks asks first: Discard switches, Save switches only after an acknowledged save', async () => {
  const { shell } = setup()
  await shell.academies.load()
  await tick()

  let marking = dirtyMarking(true)
  shell.assignments.activeMarking = marking as unknown as MarkingModel
  const guard = shell.chooseAcademy('b')!
  assert.equal(guard.academy.id, 'b')
  assert.equal(shell.academies.pendingAcademy, null, 'a dismissed dialog leaves nothing pending')
  assert.equal(shell.academies.selected?.id, 'a')
  guard.discard()
  assert.equal(marking.discarded, 1)
  assert.equal(shell.assignments.activeMarking, null)
  assert.equal(shell.academies.selected?.id, 'b')

  marking = dirtyMarking(false)
  shell.assignments.activeMarking = marking as unknown as MarkingModel
  await shell.chooseAcademy('a')!.save()
  assert.equal(marking.saved, 1)
  assert.equal(shell.academies.selected?.id, 'b', 'a failed save keeps the academy')

  marking = dirtyMarking(true)
  shell.assignments.activeMarking = marking as unknown as MarkingModel
  await shell.chooseAcademy('a')!.save()
  assert.equal(shell.academies.selected?.id, 'a')
})

test('a switch guard does nothing once the academy changed meanwhile (Keep editing is no action)', async () => {
  const { shell, server } = setup()
  server.academies = [academy('a'), academy('b'), academy('c')]
  await shell.academies.load()
  await tick()
  const marking = dirtyMarking(true)
  shell.assignments.activeMarking = marking as unknown as MarkingModel
  const guard = shell.chooseAcademy('b')!
  shell.academies.select('c')
  guard.discard()
  await guard.save()
  assert.equal(marking.discarded, 0)
  assert.equal(marking.saved, 0)
  assert.equal(shell.academies.selected?.id, 'c')
})

test('late deadlines persist per academy of the opened session', async () => {
  const { shell, late } = setup()
  await shell.academies.load()
  await tick()
  late.set('a', new Map([['s1', 7]]))
  const model = shell.makeSessionModel(live('s1'))
  assert.equal(model.lateAfterMinutes, 7)
  model.setLateAfter(12)
  assert.equal(late.get('a')?.get('s1'), 12)
  assert.equal(shell.makeSessionModel(live('s1', 'b')).lateAfterMinutes, 0)
})

test('a session screen stops being current when the academy changes or the scope ends', async () => {
  const { shell, scope } = setup()
  await shell.academies.load()
  await tick()
  const model = shell.makeSessionModel(live('s1'))
  const isCurrent = (model as unknown as { deps: { isCurrent: () => boolean } }).deps.isCurrent
  assert.equal(isCurrent(), true)
  shell.academies.select('b')
  assert.equal(isCurrent(), false)
  const next = (shell.makeSessionModel(live('s2', 'b')) as unknown as { deps: { isCurrent: () => boolean } }).deps.isCurrent
  scope.end()
  assert.equal(next(), false)
})

test('menu sign-out uses the user sign-out', () => {
  const { shell, signOuts } = setup()
  shell.openMenu()
  shell.signOut()
  assert.equal(shell.menuOpen, false)
  assert.deepEqual(signOuts, ['user'])
})

test('academy icons map like the SwiftUI app', () => {
  assert.equal(academyIcon('science'), 'hugeicons-microscope')
  assert.equal(academyIcon('constructor'), 'hugeicons-school-01')
})
