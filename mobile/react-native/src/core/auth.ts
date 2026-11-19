/**
 * The single auth authority's contract. The iOS adapter bridges the existing Supabase Swift SDK session
 * (Keychain); Android later supplies a Keystore-backed implementation. Platform adapters classify their
 * SDK's errors by type and auth-server response (never by message text) into these failures.
 */

/**
 * Why a stored session couldn't be used. Only `signedOut` means the credentials are gone or definitively
 * rejected (no session, or a 4xx session/refresh-token/user rejection); everything else keeps them.
 * - `unavailable`: network failure, timeout, 429, 5xx or an unclassified failure.
 * - `cancelled`: the work was cancelled, or its refresh was discarded because the stored session changed.
 */
export type AuthFailureKind = 'signedOut' | 'unavailable' | 'cancelled'

export class AuthFailure extends Error {
  readonly kind: AuthFailureKind

  constructor(kind: AuthFailureKind) {
    super(`Auth failure: ${kind}`)
    this.name = 'AuthFailure'
    this.kind = kind
  }
}

export type SignInFailureKind = 'invalidCredentials' | 'network' | 'other'

export class SignInFailure extends Error {
  readonly kind: SignInFailureKind

  constructor(kind: SignInFailureKind) {
    super(`Sign-in failure: ${kind}`)
    this.name = 'SignInFailure'
    this.kind = kind
  }
}

export interface AuthAuthority {
  /** Resolves once a valid (refreshed if needed) stored session exists. Rejects with `AuthFailure`. */
  restoreSession(): Promise<void>
  /** Rejects with `SignInFailure`. */
  signIn(phone: string, password: string): Promise<void>
  /** Current access token; `forceRefresh` renews it first (used after a 401). Rejects with `AuthFailure`. */
  accessToken(forceRefresh: boolean): Promise<string>
  /** Always clears local credentials, even if the server call fails. Never rejects. */
  signOut(): Promise<void>
}
