import { AccessibilityInfo } from 'react-native'
import { useSyncExternalStore } from 'react'

// One app-wide subscription. Android's `isBoldTextEnabled` always resolves false and has no change event.
let bold = false
let started = false
const listeners = new Set<() => void>()

function update(value: boolean) {
  if (value === bold) return
  bold = value
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  if (!started) {
    started = true
    AccessibilityInfo.addEventListener('boldTextChanged', update)
    AccessibilityInfo.isBoldTextEnabled().then(update, () => {})
  }
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** iOS Settings › Accessibility › Bold Text. Icons switch to the heavier Hugeicons stroke while it is on. */
export function useBoldText() {
  return useSyncExternalStore(subscribe, () => bold)
}
