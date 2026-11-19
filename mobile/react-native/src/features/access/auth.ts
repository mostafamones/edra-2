import { AuthFailure, SignInFailure, type AuthAuthority, type AuthFailureKind } from '../../core/auth.ts'
import { Model } from '../../core/model.ts'
import { AccountScope } from '../../core/ownership.ts'
import { normalizeEgyptianPhone } from './phone.ts'

/**
 * Remembered academy selection on this device. iOS keeps the existing `selectedAcademyID` UserDefaults
 * key; Android may use any app-private store. Holds an id only, never credentials. Calls may be async.
 */
export interface SelectionStore {
  read(): string | null | Promise<string | null>
  write(academyId: string): void | Promise<void>
  clear(): void | Promise<void>
}

/**
 * - `restoring`: cold launch is checking the stored session.
 * - `restoreFailed`: the session couldn't be checked right now; credentials are kept and nothing
 *   academy-scoped loads until `retryRestore()` succeeds.
 */
export type AuthState = 'restoring' | 'restoreFailed' | 'signedOut' | 'signingIn' | 'authenticated'

export const NETWORK_MESSAGE = "Can't reach the server. Check your connection and try again."

/** Sign-in and session lifetime over the app's single auth authority (port of iOS AuthModel). */
export class AuthController extends Model {
  state: AuthState = 'restoring'
  errorMessage: string | null = null
  phoneError: string | null = null
  /** The current account's scope while authenticated; ended before any sign-out clears state. */
  scope: AccountScope | null = null

  readonly authority: AuthAuthority
  private readonly selection: SelectionStore
  /** Bumped by every attempt and sign-out, so a late restore result can't override something newer. */
  private attempt = 0
  private restoringNow = false

  constructor(deps: { authority: AuthAuthority; selection: SelectionStore }) {
    super()
    this.authority = deps.authority
    this.selection = deps.selection
  }

  /** Cold-launch restoration. Concurrent calls share one attempt. */
  async restore(): Promise<void> {
    if (this.state !== 'restoring' || this.restoringNow) return
    const attempt = ++this.attempt
    this.restoringNow = true
    try {
      let failure: AuthFailureKind | null = null
      try {
        await this.authority.restoreSession()
      } catch (error) {
        failure = error instanceof AuthFailure ? error.kind : 'unavailable'
      }
      const stale = () => attempt !== this.attempt || this.state !== 'restoring'
      if (stale()) return

      if (failure === null) return this.authenticated()
      if (failure === 'signedOut') {
        // Also clears a rejected session the SDK kept, so the next launch doesn't retry it.
        await this.authority.signOut()
        if (stale()) return
        this.state = 'signedOut'
      } else {
        // `unavailable`, or a refresh the authority discarded: offer Retry, never an endless spinner.
        this.state = 'restoreFailed'
      }
      this.changed()
    } finally {
      if (attempt === this.attempt) this.restoringNow = false
    }
  }

  async retryRestore(): Promise<void> {
    if (this.state !== 'restoreFailed') return
    this.state = 'restoring'
    this.changed()
    await this.restore()
  }

  async signIn(phone: string, password: string): Promise<void> {
    if (this.state !== 'signedOut') return
    this.errorMessage = null
    this.phoneError = null

    const normalized = normalizeEgyptianPhone(phone)
    if (!normalized) {
      this.phoneError = phone ? 'Enter a valid Egyptian mobile number.' : 'Enter your phone number.'
      return this.changed()
    }
    if (!password) {
      this.errorMessage = 'Enter your password.'
      return this.changed()
    }

    this.state = 'signingIn'
    this.changed()
    try {
      await this.authority.signIn(normalized, password)
    } catch (error) {
      const kind = error instanceof SignInFailure ? error.kind : 'other'
      this.state = 'signedOut'
      this.errorMessage =
        kind === 'invalidCredentials' ? 'Wrong phone number or password.'
        : kind === 'network' ? NETWORK_MESSAGE
        : "Couldn't sign in. Please try again."
      return this.changed()
    }
    this.authenticated()
  }

  /** Signs out only while `scope` is the current account: a late 401 from an earlier account is ignored. */
  async signOutFrom(scope: AccountScope): Promise<void> {
    if (!scope.isActive || scope !== this.scope) return
    await this.signOut()
  }

  /** User sign-out. Ends the scope first so nothing in flight can touch the next account. */
  async signOut(): Promise<void> {
    this.scope?.end()
    this.scope = null
    this.attempt += 1
    this.restoringNow = false
    this.changed()
    await this.authority.signOut()
    try {
      await this.selection.clear()
    } catch {}
    this.errorMessage = null
    this.phoneError = null
    this.state = 'signedOut'
    this.changed()
  }

  private authenticated(): void {
    this.scope?.end()
    this.scope = new AccountScope()
    this.state = 'authenticated'
    this.changed()
  }
}
