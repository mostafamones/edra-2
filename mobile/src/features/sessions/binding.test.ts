// Run: node --test mobile/src/features/sessions/*.test.ts (Node ≥ 22.18, no dependencies).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AccountScope, AcademySelection } from '../../core/ownership.ts'
import { ControlledFetch, errorJSON, makeClient, ScriptedAuth } from '../../core/testing.ts'
import { bindRequestPort, LiveSessionsModel } from './index.ts'

function setUp(tokens: string[] = Array(10).fill('t')) {
  const fetch = new ControlledFetch()
  const scope = new AccountScope()
  return { fetch, scope, api: bindRequestPort(makeClient(new ScriptedAuth(tokens), fetch), scope) }
}

test('structured failures keep status, code, request id, Retry-After and details', async () => {
  const { fetch, api } = setUp()
  const result = api.patch('api/v1/x', { a: 1 }, { idempotencyKey: 'k1', structuredErrors: true })
  await fetch.waitFor(1)
  assert.equal(fetch.header(0, 'Idempotency-Key'), 'k1')
  fetch.respond(0, 429, errorJSON('RATE_LIMITED', { n: 1 }), { 'Retry-After': '5' })
  assert.deepEqual(await result, {
    ok: false,
    error: {
      kind: 'rejected',
      failure: { status: 429, code: 'RATE_LIMITED', message: 'RATE_LIMITED message', requestId: 'r1', retryAfter: 5, details: { n: 1 } },
    },
  })
})

test('unstructured failures are server messages; absent fields stay absent', async () => {
  const { fetch, api } = setUp()
  const plain = api.get('a')
  const structured = api.post('b', {}, { idempotencyKey: 'k', structuredErrors: true })
  await fetch.waitFor(2)
  fetch.respond(0, 500, errorJSON('BOOM'))
  fetch.respond(1, 404, 'not json')
  assert.deepEqual(await plain, { ok: false, error: { kind: 'server', message: 'BOOM message' } })
  assert.deepEqual(await structured, {
    ok: false,
    error: { kind: 'rejected', failure: { status: 404, code: 'UNCODED_ERROR', message: 'Server error (404).', details: undefined } },
  })
})

test('a read-only POST sends no key; a PATCH without one is refused locally', async () => {
  const { fetch, api } = setUp()
  const lookup = api.post('lookup', {})
  await fetch.waitFor(1)
  assert.equal(fetch.header(0, 'Idempotency-Key'), undefined)
  fetch.respond(0, 200, '{"ok":1}')
  assert.deepEqual(await lookup, { ok: true, value: { ok: 1 } })
  assert.equal((await api.patch('x', {})).ok, false)
  assert.equal(fetch.calls.length, 1)
})

test('ending the account scope cancels its requests', async () => {
  const { fetch, scope, api } = setUp()
  const result = api.get('x')
  await fetch.waitFor(1)
  scope.end()
  assert.deepEqual(await result, { ok: false, error: { kind: 'cancelled' } })
})

test('a late 401 from an ended account never reaches its sign-out', async () => {
  const { fetch, scope, api } = setUp()
  const selection = new AcademySelection(scope)
  const context = selection.select('A')!
  const log: string[] = []
  const model = new LiveSessionsModel({
    api,
    isCurrent: (c) => selection.isCurrent(c),
    owner: { onUnauthenticated: () => void log.push('signOut'), onForbidden: () => void log.push('forbidden') },
  })
  const load = model.load(context)
  await fetch.waitFor(1)
  scope.end()
  await load
  assert.deepEqual(log, [])
  assert.deepEqual(model.sessions, [])
})

test('a second 401 after refresh is unauthenticated for the current scope', async () => {
  const { fetch, scope, api } = setUp()
  const selection = new AcademySelection(scope)
  const log: string[] = []
  const model = new LiveSessionsModel({
    api,
    isCurrent: (c) => selection.isCurrent(c),
    owner: { onUnauthenticated: () => void log.push('signOut'), onForbidden: () => void log.push('forbidden') },
  })
  const load = model.load(selection.select('A'))
  await fetch.waitFor(1)
  fetch.respond(0, 401, '')
  await fetch.waitFor(2)
  fetch.respond(1, 401, '')
  await load
  assert.deepEqual(log, ['signOut'])
})
