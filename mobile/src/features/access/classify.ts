import { AuthFailure, SignInFailure, type AuthFailureKind, type SignInFailureKind } from '../../core/auth.ts'

/**
 * Error classification for the platform adapters, by error type and auth-server status/code, never by
 * message text. The supabase-js checks read the same `__isAuthError`/`name` fields as the SDK's own
 * `isAuthApiError`/`isAuthSessionMissingError`/... guards, so this file stays dependency-free and testable.
 */

/** Same set as iOS `SupabaseAuthService.rejectedCodes`. */
const REJECTED_CODES = new Set([
  'session_not_found', 'session_expired', 'refresh_token_not_found', 'refresh_token_already_used',
  'user_not_found', 'user_banned', 'bad_jwt', 'invalid_jwt', 'no_authorization',
])

type Fields = { __isAuthError?: unknown; name?: unknown; status?: unknown; code?: unknown }
const fields = (error: unknown): Fields => (typeof error === 'object' && error !== null ? (error as Fields) : {})
const authErrorName = (error: unknown) => {
  const e = fields(error)
  return e.__isAuthError === true && typeof e.name === 'string' ? e.name : null
}

/** supabase-js session/refresh failure → AuthFailure kind (mirrors iOS `SupabaseAuthService.classify`). */
export function classifySessionError(error: unknown): AuthFailureKind {
  if (fields(error).name === 'AbortError') return 'cancelled'
  switch (authErrorName(error)) {
    case 'AuthSessionMissingError': return 'signedOut'
    case 'AuthRefreshDiscardedError': return 'cancelled'
    case 'AuthApiError': {
      const { status, code } = fields(error)
      if (typeof status !== 'number' || status === 429 || status >= 500) return 'unavailable'
      return status >= 400 && status < 500 && typeof code === 'string' && REJECTED_CODES.has(code)
        ? 'signedOut'
        : 'unavailable'
    }
    default: return 'unavailable' // AuthRetryableFetchError (network, 502–504), unknown errors
  }
}

/** supabase-js `signInWithPassword` error → SignInFailure kind (mirrors iOS sign-in mapping). */
export function classifySignInError(error: unknown): SignInFailureKind {
  const name = authErrorName(error)
  if (name === 'AuthRetryableFetchError') return 'network'
  if (name === 'AuthApiError') {
    const code = fields(error).code
    return code === 'invalid_credentials' || code === 'user_not_found' ? 'invalidCredentials' : 'other'
  }
  return 'other'
}

const AUTH_KINDS: readonly AuthFailureKind[] = ['signedOut', 'unavailable', 'cancelled']
const SIGN_IN_KINDS: readonly SignInFailureKind[] = ['invalidCredentials', 'network', 'other']

/** iOS native module rejection (its `code` is the Swift failure case) → AuthFailure. */
export function nativeAuthFailure(error: unknown): AuthFailure {
  const code = fields(error).code
  return new AuthFailure(AUTH_KINDS.find((k) => k === code) ?? 'unavailable')
}

/** iOS native module rejection → SignInFailure. */
export function nativeSignInFailure(error: unknown): SignInFailure {
  const code = fields(error).code
  return new SignInFailure(SIGN_IN_KINDS.find((k) => k === code) ?? 'other')
}
