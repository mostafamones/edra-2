// Run: node --test mobile/src/navigation/*.test.ts (Node ≥ 22.18, no dependencies).
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { modalRouteOptions } from './routes.ts'

const src = new URL('..', import.meta.url).pathname

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.tsx?$/.test(name) && !name.endsWith('.test.ts') ? [path] : []
  })
}

test('the iOS workspace route is a native full-screen modal without a stack header or swipe', () => {
  assert.deepEqual(modalRouteOptions, { presentation: 'fullScreenModal', headerShown: false, gestureEnabled: false })
})

// A native-stack screen inside a React Native Modal attaches a second RCTSurfaceTouchHandler under the Modal's own;
// it fails and cancels every touch, so no Pressable fires (device: workspace rows and pills dead).
test('no module mounts native-stack screens inside a React Native Modal', () => {
  for (const file of sources(src)) {
    const text = readFileSync(file, 'utf8')
    const stacks = /createNativeStackNavigator|NavigationContainer/.test(text)
    const modal = /\bimport\s*\{[^}]*\bModal\b[^}]*\}\s*from 'react-native'|FullScreen\.tsx'/.test(text)
    assert.ok(!(stacks && modal), `${file} combines a native stack with a React Native Modal`)
  }
})

test('the shell presents the iOS workspace as a modal route, not inside AssignmentsScreen\'s Modal', () => {
  const app = readFileSync(join(src, 'app/EdraApp.tsx'), 'utf8')
  assert.match(app, /open=\{chrome\.modalRoutes \? null : shell\.assignment\}/)
  assert.match(app, /modal: true,\s*element: <WorkspaceScreen/)
})
