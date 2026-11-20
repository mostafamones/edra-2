import assert from 'node:assert/strict'
import { test } from 'node:test'
import { placeMenu } from './menuPlacement.ts'

const screen = { width: 390, height: 844 }
const pill = (y: number, x = 16) => ({ x, y, width: 140, height: 32 })

test('opens over the pill, top edges aligned, when there is room below', () => {
  assert.deepEqual(placeMenu(pill(110), screen, 59, 810), { left: 16, width: 220, maxHeight: 692, top: 110 })
})

test('grows upward from the pill bottom when the space below is short', () => {
  assert.deepEqual(placeMenu(pill(700), screen, 59, 810), { left: 16, width: 220, maxHeight: 665, bottom: 112 })
})

test('stays above the keyboard and inside the screen edges', () => {
  // Keyboard top at 500 leaves 0 below a pill at 492, so the menu grows upward and ends at the keyboard margin.
  assert.deepEqual(placeMenu(pill(480, 300), screen, 59, 500), { left: 162, width: 220, maxHeight: 425, bottom: 352 })
})

test('clamps a pill partly under the status bar below the safe area', () => {
  assert.deepEqual(placeMenu(pill(40), screen, 59, 810), { left: 16, width: 220, maxHeight: 735, top: 67 })
})
