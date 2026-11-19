// Test doubles for the core; imported only by *.test.ts.
import { AuthFailure, type AuthFailureKind } from './auth.ts'
import { ApiClient } from './api.ts'

type Call = { url: string; init: RequestInit; resolve: (r: Response) => void; reject: (e: unknown) => void; done: boolean }

/** A fetch whose requests stay pending until the test completes them, in any order. Honors `init.signal`. */
export class ControlledFetch {
  readonly calls: Call[] = []

  readonly fetch = (url: string, init: RequestInit): Promise<Response> =>
    new Promise((resolve, reject) => {
      const call: Call = { url, init, resolve, reject, done: false }
      this.calls.push(call)
      const abort = () => this.settle(call, () => reject(new DOMException('Aborted', 'AbortError')))
      if (init.signal?.aborted) abort()
      else init.signal?.addEventListener('abort', abort, { once: true })
    })

  call(index: number): Call {
    const call = this.calls[index]
    if (!call) throw new Error(`No request ${index}`)
    return call
  }

  header(index: number, name: string): string | undefined {
    return (this.call(index).init.headers as Record<string, string>)[name]
  }

  async waitFor(count: number): Promise<void> {
    for (let i = 0; i < 1000 && this.calls.length < count; i++) await new Promise((r) => setImmediate(r))
    if (this.calls.length < count) throw new Error(`Expected ${count} requests, got ${this.calls.length}`)
  }

  respond(index: number, status: number, body: string, headers: Record<string, string> = {}): void {
    const call = this.call(index)
    this.settle(call, () => call.resolve(new Response(status === 204 ? null : body, { status, headers })))
  }

  fail(index: number, error: unknown = new TypeError('Network request failed')): void {
    const call = this.call(index)
    this.settle(call, () => call.reject(error))
  }

  private settle(call: Call, action: () => void): void {
    if (call.done) return
    call.done = true
    action()
  }
}

/** An auth authority answering from a script and recording each `forceRefresh` flag. */
export class ScriptedAuth {
  readonly flags: boolean[] = []
  private readonly script: Array<string | AuthFailureKind | Promise<string>>

  constructor(script: Array<string | AuthFailureKind | Promise<string>>) {
    this.script = script
  }

  accessToken(forceRefresh: boolean): Promise<string> {
    this.flags.push(forceRefresh)
    const next = this.script.shift()
    if (next === undefined) return Promise.reject(new Error('Script exhausted'))
    if (typeof next !== 'string') return next
    if (next === 'signedOut' || next === 'unavailable' || next === 'cancelled') return Promise.reject(new AuthFailure(next))
    return Promise.resolve(next)
  }
}

export function makeClient(auth: ScriptedAuth, fetch: ControlledFetch, timeoutMs?: number): ApiClient {
  let id = 0
  return new ApiClient({ origin: 'https://api.example.test/', auth, fetch: fetch.fetch, newId: () => `req-${++id}`, timeoutMs })
}

export function errorJSON(code: string, details?: unknown): string {
  return JSON.stringify({ error: { code, message: `${code} message`, request_id: 'r1', details } })
}

/** Resolves with the error a promise rejects with. */
export async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('Expected a rejection')
}
