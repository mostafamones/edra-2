import { useEffect, useReducer, useRef, useSyncExternalStore } from 'react'
import type { Model } from '../port.ts'
import type { Dialog, SessionsPlatform } from './platform.ts'

/** Re-renders on every committed model change; read the model's fields and getters directly. */
export function useModel<M extends Model>(model: M): M {
  useSyncExternalStore(model.subscribe, () => model.version)
  return model
}

/** Runs `effect` after `delayMs` unless `key` changes first (SwiftUI `.task(id:)` + `Task.sleep`). */
export function useDebounced(key: string, delayMs: number, effect: () => void) {
  const latest = useRef(effect)
  latest.current = effect
  useEffect(() => {
    if (delayMs <= 0) return latest.current()
    const timer = setTimeout(() => latest.current(), delayMs)
    return () => clearTimeout(timer)
  }, [key, delayMs])
}

/**
 * A state-driven alert (SwiftUI `.alert(isPresented:)`): presented whenever `message` is set and no alert
 * from this hook is open; `clear` resets the model field when it closes. The same text later shows again.
 */
export function useMessageDialog(
  platform: SessionsPlatform,
  message: string | null,
  build: (message: string, close: () => void) => Dialog,
  clear: () => void,
  enabled = true,
) {
  const open = useRef(false)
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    if (!enabled || message === null || open.current) return
    open.current = true
    const close = () => {
      if (!open.current) return
      open.current = false
      clear()
      rerender()
    }
    const dialog = build(message, close)
    platform.present({
      ...dialog,
      actions: dialog.actions.map((a) => ({ ...a, onPress: () => (close(), a.onPress?.()) })),
      onDismiss: () => (close(), dialog.onDismiss?.()),
    })
  })
}
