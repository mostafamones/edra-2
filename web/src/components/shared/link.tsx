import { forwardRef, type AnchorHTMLAttributes } from 'react'
import { Link as RouterLink, useRouter, type LinkProps } from '@tanstack/react-router'
import { legacyDocumentPath } from '@/lib/document-navigation'

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { href: string | URL | { pathname?: string; query?: Record<string, unknown>; hash?: string }; replace?: boolean; scroll?: boolean; prefetch?: boolean | null }
function hrefString(href: Props['href']) {
  if (typeof href === 'string') return href
  if (href instanceof URL) return href.href
  const search = new URLSearchParams(Object.entries(href.query ?? {}).map(([key, value]) => [key, String(value)])).toString()
  return (href.pathname ?? '') + (search ? `?${search}` : '') + (href.hash ? `#${href.hash.replace(/^#/, '')}` : '')
}
const Link = forwardRef<HTMLAnchorElement, Props>(function Link({ href, replace, scroll, prefetch, ...props }, ref) {
  const value = hrefString(href)
  // The Router's origin is the request's on the server, so SSR and hydration make the same decision.
  const router = useRouter({ warn: false })
  const origin = router?.origin
  const absolute = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)
  // Router resolves a bare `?page=2` from the root; a browser resolves it from the current URL.
  const target = router && (absolute || !value.startsWith('/')) ? new URL(value, new URL(router.latestLocation.publicHref, origin)) : null
  const internal = target ? target.pathname + target.search + target.hash : value
  if ((absolute && (!target || target.origin !== origin)) || legacyDocumentPath(internal)) return <a {...props} href={value} ref={ref} />
  // Router's typed `to` cannot express Edra's public hrefs; buildLocation parses `href` through the rewrite.
  const link = { ...props, href: internal, replace, resetScroll: scroll, preload: prefetch === false ? false : prefetch ? 'intent' : undefined } as unknown as LinkProps
  return <RouterLink {...link} ref={ref} />
})
export default Link
