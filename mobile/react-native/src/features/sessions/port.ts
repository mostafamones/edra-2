// The narrow request/ownership port this feature needs. The shared request core binds it later; tests
// bind a controllable fake. Mirrors the iOS APIClient error classes (mobile/docs/api.md).

export interface APIFailure {
  status: number
  /** Backend code, or UNREADABLE_RESPONSE (undecodable 2xx) / UNCODED_ERROR (no backend code). */
  code: string
  message: string
  requestId?: string
  retryAfter?: number
  /** Raw `error.details`, read by the caller that understands the code. */
  details?: unknown
}

export const UNREADABLE_RESPONSE = 'UNREADABLE_RESPONSE'
export const UNCODED_ERROR = 'UNCODED_ERROR'

export type APIError =
  | { kind: 'unauthenticated' } // already retried once after a forced refresh
  | { kind: 'forbidden' }
  | { kind: 'cancelled' } // the owner went away; not proof of success or failure
  | { kind: 'network' }
  | { kind: 'server'; message: string }
  | { kind: 'rejected'; failure: APIFailure } // only for structuredErrors requests

export type Result<T> = { ok: true; value: T } | { ok: false; error: APIError }

export interface RequestOptions {
  /** Reused unchanged on every retry of one logical action. */
  idempotencyKey?: string
  /** Return `rejected` with status/code/details instead of `server(message)`. */
  structuredErrors?: boolean
}

/** Bearer HTTP over the Edra API. Paths are relative (`api/v1/...`); the core owns origin, token and refresh. */
export interface RequestPort {
  get<T>(path: string, options?: RequestOptions): Promise<Result<T>>
  post<T>(path: string, body: unknown, options?: RequestOptions): Promise<Result<T>>
  patch<T>(path: string, body: unknown, options?: RequestOptions): Promise<Result<T>>
}

/** The selected academy plus a selection epoch: A → B → A is a new context. */
export interface AcademyContext {
  academyId: string
  epoch: number
}

export const sameContext = (a: AcademyContext | null, b: AcademyContext | null) =>
  a === b || (!!a && !!b && a.academyId === b.academyId && a.epoch === b.epoch)

/** Account/academy ownership callbacks supplied by the app shell. */
export interface Ownership {
  /** Scope-bound sign-out; only called while the owner is current. */
  onUnauthenticated(): Promise<void> | void
  /** Revalidates academy access (a suspended or removed membership drops the academy). */
  onForbidden(): Promise<void> | void
}

export { Model } from '../../core/model.ts'

export const NETWORK_MESSAGE = "Can't reach the server. Check your connection and try again."
