import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { ApiError, UNCODED_ERROR, UNREADABLE_RESPONSE, type ApiFailure } from './api.ts'
import { ControlledFetch, ScriptedAuth, errorJSON, makeClient, rejection } from './testing.ts'
import { createCommand, writeOutcome } from './write.ts'

const failure = (status: number, code: string): ApiFailure =>
  ({ status, code, message: code, requestId: null, retryAfter: null, details: null })
const rejected = (status: number, code: string) => new ApiError('rejected', code, failure(status, code))

describe('write outcomes', () => {
  test('no response, throttling, 5xx and unreadable 2xx are uncertain', () => {
    assert.equal(writeOutcome(new ApiError('network')).kind, 'uncertain')
    assert.equal(writeOutcome(new Error('unknown')).kind, 'uncertain')
    assert.deepEqual(writeOutcome(rejected(429, 'THROTTLED')), { kind: 'uncertain', reason: 'throttled', failure: failure(429, 'THROTTLED') })
    assert.equal(writeOutcome(rejected(503, UNCODED_ERROR)).kind, 'uncertain')
    assert.equal(writeOutcome(rejected(200, UNREADABLE_RESPONSE)).kind, 'uncertain')
  })

  test('other codes are definitive; auth and cancellation stay distinct', () => {
    assert.equal(writeOutcome(rejected(409, 'ATTENDANCE_CONFLICT')).kind, 'rejected')
    assert.equal(writeOutcome(rejected(404, UNCODED_ERROR)).kind, 'rejected')
    assert.equal(writeOutcome(new ApiError('unauthenticated')).kind, 'unauthenticated')
    assert.equal(writeOutcome(new ApiError('forbidden')).kind, 'forbidden')
    assert.equal(writeOutcome(new ApiError('cancelled')).kind, 'cancelled')
  })
})

describe('logical idempotency', () => {
  test('a retained command replays the same key and body after an uncertain outcome', async () => {
    let keys = 0
    const command = createCommand({ status: 'present', expected_version: 4 }, () => `key-${++keys}`)
    const fetch = new ControlledFetch()
    const client = makeClient(new ScriptedAuth(['t', 't']), fetch)
    const send = () => client.patch('api/v1/x', command.body, command.key, { structuredErrors: true })

    const first = rejection(send())
    await fetch.waitFor(1)
    fetch.respond(0, 503, errorJSON('UNAVAILABLE'))
    assert.equal(writeOutcome(await first).kind, 'uncertain')

    const retry = send()
    await fetch.waitFor(2)
    fetch.respond(1, 200, '{"outcome":"replayed"}')
    assert.deepEqual(await retry, { outcome: 'replayed' })
    assert.equal(keys, 1)
    assert.equal(fetch.header(1, 'Idempotency-Key'), fetch.header(0, 'Idempotency-Key'))
    assert.equal(fetch.call(1).init.body, fetch.call(0).init.body)
    assert.throws(() => ((command.body as { status: string }).status = 'absent'))
  })
})
