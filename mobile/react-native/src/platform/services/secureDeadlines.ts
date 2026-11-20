import { parseLateAfter, type LateAfterStore } from '../../features/sessions/detail.ts'

type Storage = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** Synchronous storage keeps the setting available when a session model first opens. */
export function createLateDeadlineStores(storage: Storage): (academyId: string) => LateAfterStore {
  // Academy and session ids are UUID strings. The dot separates the two SecureStore-safe segments.
  return (academyId) => {
    const key = (sessionId: string) => `lateAfterMinutes.${academyId}.${sessionId}`
    return {
      get(sessionId) {
        const stored = storage.getItem(key(sessionId))
        return stored === null ? undefined : parseLateAfter(stored) ?? undefined
      },
      set(sessionId, minutes) {
        storage.setItem(key(sessionId), String(minutes))
      },
    }
  }
}
