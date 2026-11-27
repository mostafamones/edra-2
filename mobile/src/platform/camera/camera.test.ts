// Run: node --test mobile/src/platform/camera/*.test.ts (Node ≥ 22.18, no dependencies).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ScanFilter } from '../../features/assignments/scan.ts'
import { CodePresence, HOLD_MS, nextStatus, nextTorch, pinchZoom, resolveCameraAccess, statusNotice, type CameraStatus } from './state.ts'

test('complete frames replace the visible set, including an empty frame', () => {
  const p = new CodePresence()
  assert.deepEqual(p.seen(['B', 'A'], 0, true), ['A', 'B'])
  assert.deepEqual(p.seen(['B'], 10, true), ['B'])
  assert.deepEqual(p.seen([], 20, true), [])
  assert.equal(p.nextExpiry(), null)
})

test('partial reports accumulate and a code drops out after the hold window', () => {
  const p = new CodePresence()
  p.seen(['A'], 0, false)
  assert.deepEqual(p.seen(['B'], 100, false), ['A', 'B'])
  assert.equal(p.nextExpiry(), HOLD_MS)
  assert.equal(p.expire(HOLD_MS - 1), null)
  assert.deepEqual(p.expire(HOLD_MS), ['B'])
  p.seen(['B'], 300, false) // still held: its window restarts
  assert.equal(p.expire(100 + HOLD_MS), null)
  assert.deepEqual(p.expire(300 + HOLD_MS), [])
})

test('resume keeps a code held through backgrounding', () => {
  const p = new CodePresence()
  p.seen(['A'], 0, false)
  p.resume(10_000) // nothing was seen while stopped
  assert.equal(p.expire(10_000 + HOLD_MS - 1), null)
})

test('held code is handled once; removing it rearms the assignment filter', () => {
  const p = new CodePresence()
  const filter = new ScanFilter()
  const frame = (codes: string[], now: number) => filter.recognized(p.seen(codes, now, false), false)
  assert.equal(frame(['S1'], 0), 'S1')
  assert.equal(frame(['S1'], 100), null) // held
  assert.equal(filter.recognized(p.expire(100 + HOLD_MS) ?? [], false), null) // removed
  assert.equal(frame(['S1'], 1000), 'S1') // rearmed
})

test('a code held while paused stays suppressed; a new code is taken after the pause', () => {
  const p = new CodePresence()
  const filter = new ScanFilter()
  assert.equal(filter.recognized(p.seen(['S1'], 0, true), false), 'S1')
  assert.equal(filter.recognized(p.seen(['S1', 'S2'], 10, true), true), null) // sheet open
  assert.equal(filter.recognized(p.seen(['S1', 'S2'], 20, true), false), 'S2')
})

test('status follows native events; failure is sticky', () => {
  let s: CameraStatus = { kind: 'starting' }
  s = nextStatus(s, { status: 'ready' })
  assert.deepEqual(s, { kind: 'running' })
  s = nextStatus(s, { status: 'interrupted', reason: 'inUse' })
  assert.equal(statusNotice(s), 'Camera in use by another app')
  assert.deepEqual(nextStatus(s, { status: 'interrupted', reason: 'weird' }), { kind: 'interrupted', reason: 'other' })
  assert.equal(statusNotice({ kind: 'interrupted', reason: 'background' }), null)
  s = nextStatus(s, { status: 'resumed' })
  assert.equal(statusNotice(s), null)
  s = nextStatus(s, { status: 'failed' })
  assert.deepEqual(nextStatus(s, { status: 'ready' }), { kind: 'failed', message: '' })
  assert.equal(statusNotice(s), 'Camera unavailable')
})

test('torch toggles only while available and turns off when the camera stops', () => {
  let t = nextTorch({ available: false, on: false }, 'toggle')
  assert.deepEqual(t, { available: false, on: false })
  t = nextTorch(nextTorch(t, 'running'), 'toggle')
  assert.deepEqual(t, { available: true, on: true })
  t = nextTorch(t, 'stopped')
  assert.deepEqual(t, { available: true, on: false })
  assert.deepEqual(nextTorch({ available: true, on: true }, 'failed'), { available: false, on: false })
})

test('permission asks only while undetermined', async () => {
  let asked = 0
  const request = async () => (asked++, { status: 'granted' as const })
  assert.equal(await resolveCameraAccess(async () => ({ status: 'granted' }), request), 'granted')
  assert.equal(await resolveCameraAccess(async () => ({ status: 'denied' }), request), 'denied')
  assert.equal(asked, 0)
  assert.equal(await resolveCameraAccess(async () => ({ status: 'undetermined' }), request), 'granted')
  assert.equal(await resolveCameraAccess(async () => ({ status: 'undetermined' }), async () => ({ status: 'denied' })), 'denied')
  assert.equal(asked, 1)
})

test('pinch zoom is clamped to expo range', () => {
  assert.equal(pinchZoom(0, 100, 200), 0.5)
  assert.equal(pinchZoom(0.2, 100, 50), 0)
  assert.equal(pinchZoom(0.9, 100, 400), 1)
  assert.equal(pinchZoom(0.3, 0, 100), 0.3)
})
