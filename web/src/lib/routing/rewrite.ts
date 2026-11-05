import { classifyHost, describeRoute } from './index'

const infrastructure = /^(?:\/api|\/_serverFn|\/_build)(?:\/|$)|^\/(?:favicon\.ico|robots\.txt|sitemap\.xml|notifications-sw\.js|(?:next|vercel|file|globe|window)\.svg)$/
function platform(url: URL) {
  if (typeof window !== 'undefined' && url.origin !== window.location.origin) return null
  try {
    const canonical = classifyHost(url.host);
    if (canonical) return canonical;
    // The gateway validates the server-only development tunnel alias before SSR.
    // Preserve its rendered surface during hydration/navigation without exposing
    // that environment variable or treating this presentation hint as authority.
    if (process.env.NODE_ENV !== 'production' && typeof document !== 'undefined'
      && document.querySelector('meta[name="edra-platform"]')?.getAttribute('content') === 'staff') return 'staff';
    return null;
  } catch { return null }
}
export const routerRewrite = {
  input: ({ url }: { url: URL }) => {
    const result = new URL(url); const host = platform(result)
    if (host && !infrastructure.test(result.pathname)) {
      const route = describeRoute(host, result.pathname + result.search)
      // Every legacy staff URL renders the entry page, matching the gateway; `/app/x` is not academy `x`.
      result.pathname = host === 'staff' && route.legacy ? '/app' : route.internalPath
    }
    return result
  },
  output: ({ url }: { url: URL }) => {
    const result = new URL(url); const host = platform(result); const path = result.pathname
    if (!host || infrastructure.test(path)) return result
    if (host === 'staff') {
      if (path === '/app/manage/account') result.pathname = '/account'
      else if (path === '/app' || path.startsWith('/app/')) result.pathname = path.slice(4) || '/'
    } else if (host === 'student') {
      if (path === '/learn/academy' || path.startsWith('/learn/academy/')) result.pathname = path.slice(14) || '/'
      else if (path === '/learn' || path.startsWith('/learn/')) result.pathname = path.slice(6) || '/'
    }
    return result
  },
}
