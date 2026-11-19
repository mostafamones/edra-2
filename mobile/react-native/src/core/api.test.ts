import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { ApiError, UNCODED_ERROR, UNREADABLE_RESPONSE } from './api.ts'
import { ControlledFetch, ScriptedAuth, errorJSON, makeClient, rejection } from './testing.ts'

const kind = (error: unknown) => (error as ApiError).kind

describe('token recovery', () => {
  test('an unavailable token is a network failure, not signed out, and sends nothing', async () => {
    const fetch = new ControlledFetch()
    const auth = new ScriptedAuth(['unavailable'])
    assert.equal(kind(await rejection(makeClient(auth, fetch).get('x'))), 'network')
    assert.equal(fetch.calls.length, 0)
  })

  test('a rejected session is unauthenticated without a refresh', async () => {
    const auth = new ScriptedAuth(['signedOut'])
    assert.equal(kind(await rejection(makeClient(auth, new ControlledFetch()).get('x'))), 'unauthenticated')
    assert.deepEqual(auth.flags, [false])
  })

  test('a failed forced refresh after a 401 is a network failure', async () => {
    const fetch = new ControlledFetch()
    const auth = new ScriptedAuth(['old', 'unavailable'])
    const request = rejection(makeClient(auth, fetch).get('x'))
    await fetch.waitFor(1)
    fetch.respond(0, 401, errorJSON('UNAUTHENTICATED'))
    assert.equal(kind(await request), 'network')
    assert.deepEqual(auth.flags, [false, true])
  })

  test('a refresh discarded by the authority is cancellation', async () => {
    const fetch = new ControlledFetch()
    const request = rejection(makeClient(new ScriptedAuth(['old', 'cancelled']), fetch).get('x'))
    await fetch.waitFor(1)
    fetch.respond(0, 401, errorJSON('UNAUTHENTICATED'))
    assert.equal(kind(await request), 'cancelled')
  })

  test('a 401 is retried once with the refreshed token and the same mutation', async () => {
    const fetch = new ControlledFetch()
    const auth = new ScriptedAuth(['old', 'new'])
    const request = makeClient(auth, fetch).post('api/v1/x', { value: 7 }, 'key-1')
    await fetch.waitFor(1)
    fetch.respond(0, 401, errorJSON('UNAUTHENTICATED'))
    await fetch.waitFor(2)
    fetch.respond(1, 200, '{"ok":true}')
    assert.deepEqual(await request, { ok: true })
    assert.deepEqual(auth.flags, [false, true])
    const [first, retry] = [fetch.call(0), fetch.call(1)]
    assert.equal(first.url, 'https://api.example.test/api/v1/x')
    assert.equal(fetch.header(0, 'Authorization'), 'Bearer old')
    assert.equal(fetch.header(1, 'Authorization'), 'Bearer new')
    assert.equal(retry.init.method, 'POST')
    assert.equal(retry.init.body, first.init.body)
    assert.equal(retry.init.credentials, 'omit')
    assert.equal(fetch.header(1, 'Idempotency-Key'), 'key-1')
    assert.notEqual(fetch.header(0, 'X-Request-Id'), fetch.header(1, 'X-Request-Id'))
  })

  test('a second 401 after a successful refresh is unauthenticated', async () => {
    const fetch = new ControlledFetch()
    const request = rejection(makeClient(new ScriptedAuth(['old', 'new']), fetch).get('x'))
    await fetch.waitFor(1)
    fetch.respond(0, 401, errorJSON('UNAUTHENTICATED'))
    await fetch.waitFor(2)
    fetch.respond(1, 401, errorJSON('UNAUTHENTICATED'))
    assert.equal(kind(await request), 'unauthenticated')
    assert.equal(fetch.calls.length, 2)
  })

  test('concurrent 401s share one forced refresh', async () => {
    const fetch = new ControlledFetch()
    let finishRefresh!: (token: string) => void
    const refresh = new Promise<string>((resolve) => (finishRefresh = resolve))
    const auth = new ScriptedAuth(['old', 'old', refresh])
    const client = makeClient(auth, fetch)
    const a = client.get('a')
    const b = client.get('b')
    await fetch.waitFor(2)
    fetch.respond(0, 401, '')
    fetch.respond(1, 401, '')
    await new Promise((r) => setImmediate(r))
    finishRefresh('new')
    await fetch.waitFor(4)
    fetch.respond(2, 200, '"a"')
    fetch.respond(3, 200, '"b"')
    assert.deepEqual(await Promise.all([a, b]), ['a', 'b'])
    assert.deepEqual(auth.flags, [false, false, true])
    assert.equal(fetch.header(3, 'Authorization'), 'Bearer new')
  })

  test('a read-only POST sends no Idempotency-Key', async () => {
    const fetch = new ControlledFetch()
    const request = makeClient(new ScriptedAuth(['t']), fetch).post('lookup', { code: 'A1' }, null)
    await fetch.waitFor(1)
    fetch.respond(0, 200, '{}')
    await request
    assert.equal(fetch.header(0, 'Idempotency-Key'), undefined)
    assert.equal(fetch.header(0, 'Content-Type'), 'application/json')
  })
})

describe('cancellation', () => {
  test('aborting an in-flight request is cancelled, never network', async () => {
    const fetch = new ControlledFetch()
    const controller = new AbortController()
    const request = rejection(makeClient(new ScriptedAuth(['t']), fetch).get('x', { signal: controller.signal }))
    await fetch.waitFor(1)
    controller.abort()
    assert.equal(kind(await request), 'cancelled')
  })

  test('aborting while the token is pending is cancelled and sends nothing', async () => {
    const fetch = new ControlledFetch()
    const controller = new AbortController()
    const pending = new Promise<string>(() => {})
    const request = rejection(makeClient(new ScriptedAuth([pending]), fetch).get('x', { signal: controller.signal }))
    controller.abort()
    assert.equal(kind(await request), 'cancelled')
    assert.equal(fetch.calls.length, 0)
  })

  test('an already aborted signal never asks for a token', async () => {
    const auth = new ScriptedAuth(['t'])
    const error = await rejection(makeClient(auth, new ControlledFetch()).get('x', { signal: AbortSignal.abort() }))
    assert.equal(kind(error), 'cancelled')
    assert.deepEqual(auth.flags, [])
  })

  test('a timeout is a network failure, not cancellation', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const fetch = new ControlledFetch()
    const request = rejection(makeClient(new ScriptedAuth(['t']), fetch, 50).get('x'))
    await fetch.waitFor(1)
    t.mock.timers.tick(50)
    assert.equal(kind(await request), 'network')
  })

  test('a dropped connection is a network failure', async () => {
    const fetch = new ControlledFetch()
    const request = rejection(makeClient(new ScriptedAuth(['t']), fetch).get('x'))
    await fetch.waitFor(1)
    fetch.fail(0)
    assert.equal(kind(await request), 'network')
  })
})

describe('structured failures', () => {
  async function failWith(status: number, body: string, structuredErrors: boolean, headers: Record<string, string> = {}) {
    const fetch = new ControlledFetch()
    const request = rejection(makeClient(new ScriptedAuth(['t']), fetch).get('x', { structuredErrors }))
    await fetch.waitFor(1)
    fetch.respond(0, status, body, headers)
    return (await request) as ApiError
  }

  test('a coded error carries status, code, message, request id, Retry-After and details', async () => {
    const error = await failWith(409, errorJSON('MARKS_CONFLICT', { current: { version: 3 } }), true, { 'Retry-After': '12' })
    assert.equal(error.kind, 'rejected')
    assert.deepEqual(error.failure, {
      status: 409,
      code: 'MARKS_CONFLICT',
      message: 'MARKS_CONFLICT message',
      requestId: 'r1',
      retryAfter: 12,
      details: { current: { version: 3 } },
    })
  })

  test('an error without a backend code keeps its status as UNCODED_ERROR', async () => {
    const error = await failWith(404, '<html>Not found</html>', true, { 'Retry-After': 'Wed, 21 Oct 2030 07:28:00 GMT' })
    assert.equal(error.failure?.code, UNCODED_ERROR)
    assert.equal(error.failure?.status, 404)
    assert.equal(error.failure?.message, 'Server error (404).')
    assert.equal(error.failure?.retryAfter, null)
  })

  test('an unreadable 2xx is rejected as UNREADABLE_RESPONSE for structured callers', async () => {
    const error = await failWith(200, 'not json', true)
    assert.equal(error.kind, 'rejected')
    assert.equal(error.failure?.code, UNREADABLE_RESPONSE)
  })

  test('a decoder rejection is an unreadable response', async () => {
    const fetch = new ControlledFetch()
    const decode = (json: unknown) => {
      if (typeof json !== 'object' || json === null || !('id' in json)) throw new Error('missing id')
      return json
    }
    const request = rejection(makeClient(new ScriptedAuth(['t']), fetch).get('x', { structuredErrors: true, decode }))
    await fetch.waitFor(1)
    fetch.respond(0, 201, '{}')
    assert.equal((await request as ApiError).failure?.code, UNREADABLE_RESPONSE)
  })

  test('other callers get the backend message as a server error', async () => {
    const error = await failWith(422, errorJSON('VALIDATION'), false)
    assert.equal(error.kind, 'server')
    assert.equal(error.message, 'VALIDATION message')
    assert.equal(error.failure, null)
  })

  test('403 is forbidden for every caller', async () => {
    assert.equal((await failWith(403, errorJSON('FORBIDDEN'), true)).kind, 'forbidden')
  })

  test('an unencodable body fails before any request', async () => {
    const fetch = new ControlledFetch()
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    const error = await rejection(makeClient(new ScriptedAuth(['t']), fetch).post('x', cyclic, 'k'))
    assert.equal(kind(error), 'server')
    assert.equal(fetch.calls.length, 0)
  })
})
