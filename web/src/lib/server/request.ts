import '@tanstack/react-start/server-only'
import { AsyncLocalStorage } from 'node:async_hooks'
import { parseCookieHeader, serializeCookieHeader, type CookieOptions } from '@supabase/ssr'

type CookieInput = { name: string; value: string } & CookieOptions
type Context = { request: Request; jar: Map<string, string>; mutations: string[]; cache: Map<unknown, unknown> }
const storage = new AsyncLocalStorage<Context>()
function context() { const value = storage.getStore(); if (!value) throw new Error('Request context is unavailable'); return value }
export function runWithRequestContext<T>(request: Request, fn: () => T): T {
  const jar = new Map(parseCookieHeader(request.headers.get('cookie') ?? '').map(({ name, value }) => [name, value ?? '']))
  return storage.run({ request, jar, mutations: [], cache: new Map() }, fn)
}
export function getRequest() { return context().request }
export async function headers() { return context().request.headers }
export async function cookies() {
  const ctx = context()
  return {
    get: (name: string) => ctx.jar.has(name) ? { name, value: ctx.jar.get(name)! } : undefined,
    getAll: () => Array.from(ctx.jar, ([name, value]) => ({ name, value })),
    has: (name: string) => ctx.jar.has(name),
    set(nameOrCookie: string | CookieInput, value?: string, options?: CookieOptions) {
      const cookie = typeof nameOrCookie === 'string' ? { ...options, name: nameOrCookie, value: value ?? '' } : nameOrCookie
      const { name, value: cookieValue, ...attrs } = cookie
      ctx.jar.set(name, cookieValue); ctx.mutations.push(serializeCookieHeader(name, cookieValue, { path: '/', ...attrs }))
    },
    delete(nameOrCookie: string | ({ name: string } & CookieOptions)) {
      const { name, ...attrs } = typeof nameOrCookie === 'string' ? { name: nameOrCookie } : nameOrCookie
      ctx.jar.delete(name); ctx.mutations.push(serializeCookieHeader(name, '', { path: '/', ...attrs, maxAge: 0 }))
    },
  }
}
export function collectResponseCookies() { return [...context().mutations] }
export function requestCache<F extends (...args: never[]) => unknown>(fn: F): F {
  return ((...args: Parameters<F>) => {
    const root = context().cache
    let node = root.get(fn) as Map<unknown, unknown> | undefined
    if (!node) { node = new Map(); root.set(fn, node) }
    for (const arg of args) { let next = node.get(arg) as Map<unknown, unknown> | undefined; if (!next) { next = new Map(); node.set(arg, next) } node = next }
    if (!node.has(requestCache)) node.set(requestCache, fn(...args))
    return node.get(requestCache)
  }) as F
}
