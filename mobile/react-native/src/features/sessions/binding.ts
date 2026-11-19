// Binds the Sessions RequestPort to the shared request core: one ApiClient (one auth authority, shared
// forced refresh) and the current account scope's signal, so ending the scope aborts its requests.
import { ApiError, type ApiClient, type RequestOptions as CoreOptions } from '../../core/api.ts'
import type { AccountScope } from '../../core/ownership.ts'
import type { APIError, APIFailure, RequestOptions, RequestPort, Result } from './port.ts'

export function bindRequestPort(client: ApiClient, scope: AccountScope): RequestPort {
  async function run<T>(options: RequestOptions | undefined, send: (core: CoreOptions<T>) => Promise<T>): Promise<Result<T>> {
    try {
      return { ok: true, value: await send({ signal: scope.signal, structuredErrors: options?.structuredErrors ?? false }) }
    } catch (error) {
      return { ok: false, error: toPortError(error) }
    }
  }
  return {
    get: <T>(path: string, options?: RequestOptions) => run<T>(options, (o) => client.get<T>(path, o)),
    post: <T>(path: string, body: unknown, options?: RequestOptions) =>
      run<T>(options, (o) => client.post<T>(path, body, options?.idempotencyKey ?? null, o)),
    patch: <T>(path: string, body: unknown, options?: RequestOptions) => {
      const key = options?.idempotencyKey
      // Every PATCH is a write; sending one without its retry identity would be a caller bug.
      if (!key) return Promise.resolve<Result<T>>({ ok: false, error: { kind: 'server', message: 'Missing Idempotency-Key.' } })
      return run<T>(options, (o) => client.patch<T>(path, body, key, o))
    },
  }
}

export function toPortError(error: unknown): APIError {
  if (!(error instanceof ApiError)) return { kind: 'network' }
  switch (error.kind) {
    case 'server':
      return { kind: 'server', message: error.message }
    case 'rejected': {
      const f = error.failure
      if (!f) return { kind: 'server', message: error.message }
      const failure: APIFailure = { status: f.status, code: f.code, message: f.message, details: f.details ?? undefined }
      if (f.requestId !== null) failure.requestId = f.requestId
      if (f.retryAfter !== null) failure.retryAfter = f.retryAfter
      return { kind: 'rejected', failure }
    }
    default:
      return { kind: error.kind }
  }
}
