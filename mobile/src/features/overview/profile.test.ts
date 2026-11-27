// Run: node --test src/features/overview/*.test.ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiClient } from '../../core/api.ts'
import { AccountScope } from '../../core/ownership.ts'
import { ControlledFetch, ScriptedAuth } from '../../core/testing.ts'
import { ProfileModel } from './profile.ts'

const NOW = Date.parse('2026-11-20T12:00:00Z')
const me = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ user_id: 'u1', name: 'Mona Adel', avatar_url: 'https://x/a.webp?token=t', avatar_expires_at: '2026-11-20T13:00:00Z', ...extra })

function setup(tokens: string[] = ['t1', 't2', 't3', 't4']) {
  const http = new ControlledFetch()
  const scope = new AccountScope()
  let signedOut = 0
  let now = NOW
  const api = new ApiClient({ origin: 'https://edra.test', auth: new ScriptedAuth(tokens), fetch: http.fetch, newId: () => 'id' })
  const model = new ProfileModel({ api, scope, onUnauthenticated: () => void signedOut++, now: () => now })
  return { http, scope, model, signedOut: () => signedOut, setNow: (value: number) => void (now = value) }
}

test('loads the own name and picture from /api/v1/me; the picture expires', async () => {
  const { http, model, setNow } = setup()
  const load = model.load()
  await http.waitFor(1)
  assert.equal(http.call(0).url, 'https://edra.test/api/v1/me')
  http.respond(0, 200, me())
  await load
  assert.equal(model.status, 'loaded')
  assert.equal(model.name, 'Mona Adel')
  assert.equal(model.avatarUrl, 'https://x/a.webp?token=t')
  setNow(Date.parse('2026-11-20T13:00:00Z'))
  assert.equal(model.avatarUrl, null)
  assert.equal(model.name, 'Mona Adel')
})

test('name and picture are independent', async () => {
  const { http, model } = setup()
  const load = model.load()
  await http.waitFor(1)
  http.respond(0, 200, me({ name: null }))
  await load
  assert.equal(model.name, null)
  assert.ok(model.avatarUrl)

  const again = model.load()
  await http.waitFor(2)
  http.respond(1, 200, me({ avatar_url: null, avatar_expires_at: null }))
  await again
  assert.equal(model.name, 'Mona Adel')
  assert.equal(model.avatarUrl, null)
})

test('a 404 is an older server without the endpoint, not an empty profile', async () => {
  const { http, model } = setup()
  const load = model.load()
  await http.waitFor(1)
  http.respond(0, 404, '<html>Not found</html>')
  await load
  assert.equal(model.status, 'unsupported')
  assert.equal(model.name, null)
})

test('a failed refresh keeps the last good profile; a first failure reports failed', async () => {
  const { http, model } = setup()
  let load = model.load()
  await http.waitFor(1)
  http.respond(0, 500, '{"error":{"code":"INTERNAL","message":"x"}}')
  await load
  assert.equal(model.status, 'failed')

  load = model.load()
  await http.waitFor(2)
  http.respond(1, 200, me())
  await load
  load = model.load()
  await http.waitFor(3)
  http.fail(2)
  await load
  assert.equal(model.status, 'loaded')
  assert.equal(model.name, 'Mona Adel')
})

test('only the newest load commits, and nothing commits after the account scope ends', async () => {
  const { http, model, scope } = setup()
  const first = model.load()
  const second = model.load()
  await http.waitFor(2)
  http.respond(1, 200, me({ name: 'Newest' }))
  await second
  http.respond(0, 200, me({ name: 'Older' }))
  await first
  assert.equal(model.name, 'Newest')

  const late = model.load()
  await http.waitFor(3)
  scope.end()
  await late
  assert.equal(model.name, 'Newest')
})

test('an unauthenticated answer signs this account out', async () => {
  const { http, model, signedOut } = setup(['t1', 'signedOut'])
  const load = model.load()
  await http.waitFor(1)
  http.respond(0, 401, '')
  await load
  assert.equal(signedOut(), 1)
})

test('an unreadable body is a failure, not a profile', async () => {
  const { http, model } = setup()
  const load = model.load()
  await http.waitFor(1)
  http.respond(0, 200, JSON.stringify({ name: 'x' }))
  await load
  assert.equal(model.status, 'failed')
  assert.equal(model.name, null)
})
