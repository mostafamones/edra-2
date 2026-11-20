import { AuthFailure, type AuthAuthority } from './auth.ts'

/** A backend error response: stable code, message, request id, Retry-After and raw `error.details`. */
export type ApiFailure = Readonly<{
  status: number
  code: string
  message: string
  requestId: string | null
  retryAfter: number | null
  details: unknown
}>

/** Client-assigned codes for structured callers. An unreadable 2xx may follow a committed write. */
export const UNREADABLE_RESPONSE = 'UNREADABLE_RESPONSE'
export const UNCODED_ERROR = 'UNCODED_ERROR'

/**
 * - `unauthenticated`: definitive (rejected session, or a second 401 after a forced refresh).
 * - `network`: no response, timeout, or a token that can't be obtained right now. Credentials are kept.
 * - `server`: other failures for non-structured callers. `rejected`: same, for structured callers.
 * - `cancelled`: the caller's signal aborted, or the authority discarded a refresh. Not a failure to report.
 */
export type ApiErrorKind = 'unauthenticated' | 'forbidden' | 'network' | 'server' | 'rejected' | 'cancelled'

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  /** Set only for `rejected`. */
  readonly failure: ApiFailure | null

  constructor(kind: ApiErrorKind, message: string = kind, failure: ApiFailure | null = null) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.failure = failure
  }
}

export type Fetch = (url: string, init: RequestInit) => Promise<Response>

export type ApiClientOptions = {
  /** API origin, e.g. `https://edra.example`. Paths are relative to it (`api/v1/academies`). */
  origin: string
  auth: Pick<AuthAuthority, 'accessToken'>
  fetch: Fetch
  /** UUID source for X-Request-Id (Hermes has no `crypto.randomUUID`; inject one). */
  newId: () => string
  /** Whole-request timeout; iOS uses a 20 s request timeout. A timeout is `network`, never `cancelled`. */
  timeoutMs?: number
}

export type RequestOptions<T> = {
  signal?: AbortSignal
  /** Failures become `rejected` with an `ApiFailure` (attendance and marking writes) instead of `server`. */
  structuredErrors?: boolean
  /** Validates the parsed 2xx JSON; throwing makes the response unreadable. Defaults to an unchecked cast. */
  decode?: (json: unknown) => T
}

type ErrorBody = { message: string; code: string | null; requestId: string | null; details: unknown }

/**
 * Bearer-only HTTP adapter for the Edra API: no cookies, the current token per request, and one forced
 * refresh + retry after an actual 401 that reuses the method, body and Idempotency-Key. Concurrent forced
 * refreshes share one call so a rotating refresh token is not spent twice.
 */
export class ApiClient {
  private readonly options: ApiClientOptions
  private refreshing: Promise<string> | null = null

  constructor(options: ApiClientOptions) {
    this.options = options
  }

  async get<T>(path: string, options: RequestOptions<T> = {}): Promise<T> {
    return this.perform(path, 'GET', undefined, {}, options)
  }

  /** `idempotencyKey` is created once per logical action and reused on every retry; read-only POSTs pass null. */
  async post<T>(path: string, body: unknown, idempotencyKey: string | null, options: RequestOptions<T> = {}): Promise<T> {
    const headers: Record<string, string> = idempotencyKey === null ? {} : { 'Idempotency-Key': idempotencyKey }
    return this.perform(path, 'POST', encode(body), headers, options)
  }

  async patch<T>(path: string, body: unknown, idempotencyKey: string, options: RequestOptions<T> = {}): Promise<T> {
    return this.perform(path, 'PATCH', encode(body), { 'Idempotency-Key': idempotencyKey }, options)
  }

  private async perform<T>(
    path: string,
    method: string,
    body: string | undefined,
    headers: Record<string, string>,
    options: RequestOptions<T>,
  ): Promise<T> {
    try {
      try {
        return await this.send(path, method, body, headers, options, false)
      } catch (error) {
        // Only an actual 401 earns the retry; a rejected session never does.
        if (!(error instanceof ApiError && error.kind === 'unauthenticated')) throw error
        return await this.send(path, method, body, headers, options, true)
      }
    } catch (error) {
      if (error === SESSION_REJECTED) throw new ApiError('unauthenticated')
      if (error instanceof ApiError) throw error
      throw new ApiError(options.signal?.aborted ? 'cancelled' : 'network')
    }
  }

  private async send<T>(
    path: string,
    method: string,
    body: string | undefined,
    extraHeaders: Record<string, string>,
    options: RequestOptions<T>,
    forceRefresh: boolean,
  ): Promise<T> {
    const { signal, structuredErrors = false } = options
    if (signal?.aborted) throw new ApiError('cancelled')

    let bearer: string
    try {
      bearer = await untilAborted(this.token(forceRefresh), signal)
    } catch (error) {
      if (signal?.aborted) throw new ApiError('cancelled')
      // Only a definitive rejection means signed out; an unreachable auth service keeps the credentials.
      const kind = error instanceof AuthFailure ? error.kind : 'unavailable'
      if (kind === 'signedOut') throw SESSION_REJECTED
      throw new ApiError(kind === 'cancelled' ? 'cancelled' : 'network')
    }

    const headers: Record<string, string> = {
      ...extraHeaders,
      Authorization: `Bearer ${bearer}`,
      Accept: 'application/json',
      'X-Request-Id': this.options.newId(),
    }
    if (body !== undefined) headers['Content-Type'] = 'application/json'

    const controller = new AbortController()
    const abort = () => controller.abort()
    signal?.addEventListener('abort', abort)
    const timer = setTimeout(abort, this.options.timeoutMs ?? 20_000)
    let status: number
    let retryAfterHeader: string | null
    let text: string
    try {
      if (signal?.aborted) throw new ApiError('cancelled')
      const response = await this.options.fetch(joinURL(this.options.origin, path), {
        method,
        headers,
        body,
        credentials: 'omit',
        signal: controller.signal,
      })
      status = response.status
      retryAfterHeader = response.headers.get('Retry-After')
      text = await response.text()
    } catch {
      throw new ApiError(signal?.aborted ? 'cancelled' : 'network')
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
    }

    if (status >= 200 && status < 300) {
      try {
        const json: unknown = JSON.parse(text)
        return options.decode ? options.decode(json) : (json as T)
      } catch {
        const message = 'Unexpected response from the server.'
        if (!structuredErrors) throw new ApiError('server', message)
        // A 2xx can follow a committed write: structured callers must not read it as a rejection.
        throw rejected({ status, code: UNREADABLE_RESPONSE, message, requestId: null, retryAfter: null, details: null })
      }
    }
    if (status === 401) throw new ApiError('unauthenticated')
    if (status === 403) throw new ApiError('forbidden')

    const envelope = errorBody(text)
    const message = envelope?.message ?? `Server error (${status}).`
    if (!structuredErrors) throw new ApiError('server', message)
    const retryAfter = retryAfterHeader !== null && /^[+-]?\d+$/.test(retryAfterHeader) ? Number(retryAfterHeader) : null
    // No stable code (a proxy page, or a server without this endpoint): keep the status.
    throw rejected({
      status,
      code: envelope?.code ?? UNCODED_ERROR,
      message,
      requestId: envelope?.requestId ?? null,
      retryAfter,
      details: envelope?.code ? envelope.details : null,
    })
  }

  private token(forceRefresh: boolean): Promise<string> {
    if (!forceRefresh) return this.options.auth.accessToken(false)
    this.refreshing ??= this.options.auth.accessToken(true).finally(() => {
      this.refreshing = null
    })
    return this.refreshing
  }
}

/** The authority has no usable session, so there is nothing to refresh and retry with. */
const SESSION_REJECTED = Symbol('SessionRejected')

function rejected(failure: ApiFailure): ApiError {
  return new ApiError('rejected', failure.message, Object.freeze(failure))
}

function encode(body: unknown): string {
  try {
    const json = JSON.stringify(body)
    if (json !== undefined) return json
  } catch {}
  throw new ApiError('server', "Couldn't encode the request.")
}

function joinURL(origin: string, path: string): string {
  return `${origin.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

/** Settles with `promise`, or rejects as soon as `signal` aborts without cancelling the shared work. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return promise
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new ApiError('cancelled'))
    if (signal.aborted) return abort()
    signal.addEventListener('abort', abort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

function errorBody(text: string): ErrorBody | null {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  const error = isRecord(value) ? value.error : null
  if (!isRecord(error) || typeof error.message !== 'string') return null
  return {
    message: error.message,
    code: typeof error.code === 'string' ? error.code : null,
    requestId: typeof error.request_id === 'string' ? error.request_id : null,
    details: error.details ?? null,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
