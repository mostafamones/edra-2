import { createCsrfMiddleware, createMiddleware, createStart, getRouterInstance } from '@tanstack/react-start'
import { isNotFound, isRedirect } from '@tanstack/react-router'
import { runBrowserAction } from './lib/browser-actions'
import { requiresDocumentNavigation } from './lib/document-navigation'
import { browserScopeGeneration } from './lib/browser-scope'

/** The server-function transport otherwise serializes provider error details. */
export async function redactFunctionError<T>(next: () => Promise<T>): Promise<T> {
  try { return await next() } catch (error) {
    if (isRedirect(error) || isNotFound(error)) throw error
    if (process.env.NODE_ENV !== 'production') throw error
    console.error(error)
    throw new Error('Internal Server Error')
  }
}
/** Loaders own GET redirects. Action calls navigate, then reject so callers release pending state. */
export async function navigateFunctionRedirect<T>(next: () => Promise<T>, method: 'GET' | 'POST' = 'POST', isCurrent = () => true): Promise<T> {
  try { return await next() } catch (error) {
    if (!isRedirect(error) || typeof window === 'undefined' || method === 'GET') throw error
    if (!isCurrent()) return new Promise<never>(() => {})
    const router = await getRouterInstance()
    if (!isCurrent()) return new Promise<never>(() => {})
    const resolved = router.resolveRedirect(error)
    const href = resolved.options.href
    if (href && requiresDocumentNavigation(href, window.location.href)) {
      if (resolved.options.replace) window.location.replace(href); else window.location.assign(href)
    } else {
      if (href) {
        const target = new URL(href, window.location.href)
        resolved.options.href = target.pathname + target.search + target.hash
      }
      resolved.options._fromLocation = router.stores.location.get()
      await router.navigate(resolved.options)
    }
    // Next's action reducer rejected redirected actions as well. An unresolved
    // promise strands loaders and the finally blocks of forms that stay mounted.
    throw resolved
  }
}
/** Navigate after the queue releases: a destination may await queued work, and stale redirects must not navigate. */
export function runClientFunction<T>(next: () => Promise<T>, method: 'GET' | 'POST'): Promise<T> {
  const generation = browserScopeGeneration()
  return navigateFunctionRedirect(() => method === 'POST' ? runBrowserAction(next) : next(), method, () => generation === browserScopeGeneration())
}
const functionMiddleware = createMiddleware({ type: 'function' })
  .client(ctx => runClientFunction(() => ctx.next(), ctx.method))
  .server(({ next }) => redactFunctionError(next))
export const startInstance = createStart(() => ({
  requestMiddleware: [createCsrfMiddleware({ filter: ctx => ctx.handlerType === 'serverFn' })],
  functionMiddleware: [functionMiddleware],
}))
