import { useMemo } from 'react'
import { useLocation, useRouter as useTanStackRouter, redirect as routerRedirect, notFound as routerNotFound } from '@tanstack/react-router'
import { requiresDocumentNavigation } from './document-navigation'

export function redirect(href: string, status = 307): never { throw routerRedirect({ href, statusCode: status }) }
export function notFound(): never { throw routerNotFound() }
type NavigateOptions = { scroll?: boolean; transitionTypes?: string[] }
function documentNavigation(href: string) { return typeof window !== 'undefined' && requiresDocumentNavigation(href, window.location.href) }
export function useRouter() {
  const router = useTanStackRouter()
  // Stable like Next's: callers list this object in effect dependencies.
  return useMemo(() => {
    const navigate = (href: string, replace = false, { scroll, transitionTypes }: NavigateOptions = {}) => {
      if (documentNavigation(href)) { if (replace) window.location.replace(href); else window.location.assign(href); return }
      const url = new URL(href, window.location.href)
      void router.navigate({ href: url.pathname + url.search + url.hash, replace, resetScroll: scroll, viewTransition: transitionTypes && { types: transitionTypes } } as never)
    }
    return {
      push: (href: string, options?: NavigateOptions) => navigate(href, false, options),
      replace: (href: string, options?: NavigateOptions) => navigate(href, true, options),
      // invalidate() alone keeps cached matches, so Back could paint another account's loader data.
      refresh: () => { router.clearCache(); return router.invalidate() },
      back: () => router.history.back(), forward: () => router.history.forward(),
      prefetch: (href: string) => { if (!documentNavigation(href)) { const url = new URL(href, window.location.href); void router.preloadRoute({ href: url.pathname + url.search + url.hash } as never).catch(() => {}) } },
    }
  }, [router])
}
export function usePathname() { return useLocation({ select: location => new URL(location.publicHref, 'http://localhost').pathname }) }
export function useSearchParams() { const search = useLocation({ select: location => location.searchStr }); return useMemo(() => new URLSearchParams(search), [search]) }
