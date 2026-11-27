import type { ApiClient } from '../../core/api.ts'
import type { AcademyContext } from '../../core/ownership.ts'

export type Feedback = 'success' | 'failure' | 'warning' | 'recognized'

/** What the shell gives the assignment models. Callbacks must be bound to the account scope that created them. */
export type AssignmentsEnvironment = Readonly<{
  api: Pick<ApiClient, 'get' | 'post' | 'patch'>
  /** `AcademySelection.isCurrent`: false once the account scope ended or the academy changed (A → B → A too). */
  isCurrent: (context: AcademyContext) => boolean
  onUnauthenticated: () => void | Promise<void>
  /** Revalidate academies; the current one may have been suspended or removed. */
  onForbidden: () => void | Promise<void>
  /** Idempotency-Key source (UUID). */
  newKey: () => string
  /** Haptics hook for the native layer. */
  feedback?: (kind: Feedback) => void
}>

export const NETWORK_MESSAGE = "Can't reach the server. Check your connection and try again."
export const ACCESS_LOST_MESSAGE = 'You no longer have access to this academy.'

/**
 * Change notification for React: `useSyncExternalStore(model.subscribe, model.getVersion)`, then read the
 * model's getters. Every committed change bumps the version.
 */
export class Observable {
  private readonly listeners = new Set<() => void>()
  private version = 0

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  readonly getVersion = (): number => this.version

  protected changed(): void {
    this.version += 1
    for (const listener of [...this.listeners]) listener()
  }
}
