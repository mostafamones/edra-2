import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createLateDeadlineStores } from './secureDeadlines.ts'

test('late deadlines are read immediately from storage and scoped by academy and session', () => {
  const entries = new Map<string, string>()
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value) },
  }

  const first = createLateDeadlineStores(storage)('academy-a')
  assert.equal(first.get('session-a'), undefined)
  first.set('session-a', 7)
  first.set('session-b', 0)
  createLateDeadlineStores(storage)('academy-b').set('session-a', 42)

  const reopened = createLateDeadlineStores(storage)
  assert.equal(reopened('academy-a').get('session-a'), 7)
  assert.equal(reopened('academy-a').get('session-b'), 0)
  assert.equal(reopened('academy-b').get('session-a'), 42)
  assert.equal(reopened('academy-b').get('session-b'), undefined)
})
