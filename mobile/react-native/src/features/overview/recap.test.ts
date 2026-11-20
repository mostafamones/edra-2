// Run: node --test src/features/overview/*.test.ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { LiveSession } from '../sessions/contract.ts'
import { overviewAssignments, overviewSessions, roleLabel } from './recap.ts'

const summary = (id: string, state = 'active') => ({ id, title: id, dueAt: null, state, maxScore: '10', recipientCount: 1 })
const session = (id: string) => ({ id }) as LiveSession

test('live sessions: the first three, linking to Sessions only when more are loaded', () => {
  assert.deepEqual(overviewSessions([session('a'), session('b'), session('c')]).more, false)
  const recap = overviewSessions(['a', 'b', 'c', 'd'].map(session))
  assert.deepEqual(recap.shown.map((s) => s.id), ['a', 'b', 'c'])
  assert.equal(recap.more, true)
})

test('assignments: only active ones; unloaded pages keep the link instead of claiming none', () => {
  const loaded = [summary('x', 'closed'), summary('a'), summary('b', 'archived')]
  assert.deepEqual(overviewAssignments(loaded, false), { shown: [loaded[1]], more: false })
  assert.deepEqual(overviewAssignments([summary('x', 'closed')], true), { shown: [], more: true })
  assert.equal(overviewAssignments(['a', 'b', 'c', 'd'].map((id) => summary(id)), false).more, true)
})

test('roles read as labels; an unknown role is shown, not mapped', () => {
  assert.equal(roleLabel('head_admin'), 'Head Admin')
  assert.equal(roleLabel('instructor'), 'Instructor')
  assert.equal(roleLabel('teaching_assistant'), 'Teaching assistant')
})
