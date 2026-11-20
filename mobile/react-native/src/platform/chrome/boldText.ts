import { AccessibilityInfo } from 'react-native'
import { useSyncExternalStore } from 'react'

// One app-wide subscription per setting. Android's `isBoldTextEnabled` always resolves false and has no change event.
function setting(event: 'boldTextChanged' | 'reduceMotionChanged', read: () => Promise<boolean>) {
  let value = false
  let started = false
  const listeners = new Set<() => void>()
  const update = (next: boolean) => {
    if (next === value) return
    value = next
    listeners.forEach((listener) => listener())
  }
  const subscribe = (listener: () => void) => {
    if (!started) {
      started = true
      AccessibilityInfo.addEventListener(event, update)
      read().then(update, () => {})
    }
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }
  return () => useSyncExternalStore(subscribe, () => value)
}

/** iOS Settings › Accessibility › Bold Text. Icons switch to the heavier Hugeicons stroke while it is on. */
export const useBoldText = setting('boldTextChanged', () => AccessibilityInfo.isBoldTextEnabled())

/** Settings › Accessibility › Reduce Motion. Geometry animations become cross-fades while it is on. */
export const useReduceMotion = setting('reduceMotionChanged', () => AccessibilityInfo.isReduceMotionEnabled())
