import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { AcademySelection, AccountScope, LatestRequest } from './ownership.ts'
import { ControlledFetch, ScriptedAuth, makeClient, rejection } from './testing.ts'

describe('account and academy scopes', () => {
  test('A → B → A is a new context; reselecting keeps it', () => {
    const selection = new AcademySelection(new AccountScope())
    const first = selection.select('A')!
    assert.equal(selection.select('A'), first)
    selection.select('B')
    const second = selection.select('A')!
    assert.equal(second.academyId, first.academyId)
    assert.equal(selection.isCurrent(first), false)
    assert.equal(selection.isCurrent(second), true)
  })

  test('an ended account scope makes every context stale and aborts its requests', async () => {
    const scope = new AccountScope()
    const selection = new AcademySelection(scope)
    const context = selection.select('A')!
    const fetch = new ControlledFetch()
    const request = rejection(makeClient(new ScriptedAuth(['t']), fetch).get('x', { signal: scope.signal }))
    await fetch.waitFor(1)
    scope.end()
    assert.equal(selection.isCurrent(context), false)
    assert.equal((await request as { kind: string }).kind, 'cancelled')
  })
})

describe('newest request ownership', () => {
  test('loads finishing in reverse order keep only the newest', async () => {
    const fetch = new ControlledFetch()
    const client = makeClient(new ScriptedAuth(['t', 't']), fetch)
    const slot = new LatestRequest()
    let committed: unknown = null
    const load = async () => {
      const ticket = slot.begin()
      const value = await client.get('academies', { signal: ticket.signal })
      if (ticket.isCurrent()) committed = value
    }
    const older = load()
    await fetch.waitFor(1)
    const newer = load()
    await fetch.waitFor(2)
    fetch.respond(1, 200, '["A"]')
    await newer
    fetch.respond(0, 200, '["A","B"]') // B was removed since; the older answer must not restore it
    await older
    assert.deepEqual(committed, ['A'])
  })

  test('cancel aborts outstanding requests and invalidates their tickets', async () => {
    const fetch = new ControlledFetch()
    const slot = new LatestRequest()
    const ticket = slot.begin()
    const request = rejection(makeClient(new ScriptedAuth(['t']), fetch).get('x', { signal: ticket.signal }))
    await fetch.waitFor(1)
    slot.cancel()
    assert.equal(ticket.isCurrent(), false)
    assert.equal((await request as { kind: string }).kind, 'cancelled')
    assert.equal(slot.begin().signal.aborted, false)
  })
})
