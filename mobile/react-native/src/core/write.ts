import { ApiError, UNREADABLE_RESPONSE, type ApiFailure } from './api.ts'

/**
 * One logical mutation: its Idempotency-Key and body stay fixed until the server acknowledges it, so every
 * Retry (including after an app restart or a forced refresh) replays the same request.
 */
export type WriteCommand<B> = Readonly<{ key: string; body: Readonly<B> }>

export function createCommand<B>(body: B, newKey: () => string): WriteCommand<B> {
  return Object.freeze({ key: newKey(), body: Object.freeze(body) })
}

/**
 * How a write ended, for callers that keep a command until it is acknowledged (iOS `AttendanceWriteOutcome`).
 * - `uncertain`: may or may not have applied (no response, 429/THROTTLED, 5xx, unreadable 2xx). Keep the command.
 * - `rejected`: definitively not applied, or a typed outcome to review (conflict, review required, lifecycle).
 * - `cancelled`: the owner went away; not proof of success or rejection.
 */
export type WriteOutcome =
  | { kind: 'uncertain'; reason: 'network' | 'throttled' | 'server'; failure: ApiFailure | null }
  | { kind: 'rejected'; failure: ApiFailure }
  | { kind: 'unauthenticated' }
  | { kind: 'forbidden' }
  | { kind: 'cancelled' }

export function writeOutcome(error: unknown): WriteOutcome {
  if (!(error instanceof ApiError)) return { kind: 'uncertain', reason: 'server', failure: null }
  switch (error.kind) {
    case 'unauthenticated':
    case 'forbidden':
    case 'cancelled':
      return { kind: error.kind }
    case 'network':
      return { kind: 'uncertain', reason: 'network', failure: null }
    case 'server':
      return { kind: 'uncertain', reason: 'server', failure: null }
    case 'rejected': {
      const failure = error.failure!
      if (failure.code === 'THROTTLED' || failure.status === 429) return { kind: 'uncertain', reason: 'throttled', failure }
      if (failure.status >= 500 || failure.code === UNREADABLE_RESPONSE) return { kind: 'uncertain', reason: 'server', failure }
      return { kind: 'rejected', failure }
    }
  }
}
