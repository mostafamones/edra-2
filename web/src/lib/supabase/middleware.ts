import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr'
import { safeNextPath } from '../../modules/auth/return-path'
import { platformOrigin, type RouteDescriptor } from '../routing'
import { publicEnv } from '../env/public'
import { authCookieOptions, isLegacyAuthCookie } from './cookie-policy'
import { isPhoneCodeSession } from './session-grade'

export async function updateSession(request: Request, descriptor?: RouteDescriptor) {
  const jar = new Map(parseCookieHeader(request.headers.get('cookie') ?? '').map(({ name, value }) => [name, value ?? '']))
  const responseHeaders = new Headers()
  const cookieOptions = authCookieOptions()
  const supabase = createServerClient(publicEnv.supabaseUrl!, publicEnv.supabasePublishableKey!, {
    cookieOptions,
    cookies: {
      getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
      setAll(cookiesToSet, headers) {
        for (const { name, value, options } of cookiesToSet) { jar.set(name, value); responseHeaders.append('set-cookie', serializeCookieHeader(name, value, options)) }
        for (const [key, value] of Object.entries(headers)) responseHeaders.set(key, value)
      },
    },
  })
  const { data } = await supabase.auth.getClaims()
  const user = data?.claims && !isPhoneCodeSession(data.claims) ? data.claims : null
  const url = new URL(request.url); const pathname = url.pathname
  const platform = descriptor?.platform === 'student' ? 'student' : 'staff'
  // The push service worker script must never redirect to sign-in (a redirected script fails registration/update).
  const commonPublic = /^(?:\/auth|\/invite|\/api|\/_serverFn|\/_build)(?:\/|$)|^\/notifications-sw\.js$/.test(pathname)
  const protectedRoute = (!commonPublic && descriptor && descriptor.platform !== 'marketing') || /^(?:\/app|\/learn|\/onboarding)(?:\/|$)/.test(pathname)
  responseHeaders.set('cache-control', 'private, no-store')
  for (const name of jar.keys()) if (isLegacyAuthCookie(name)) {
    responseHeaders.append('set-cookie', serializeCookieHeader(name, '', { path: '/', maxAge: 0 }))
    responseHeaders.append('set-cookie', serializeCookieHeader(name, '', { ...cookieOptions, maxAge: 0 }))
  }
  let redirect: Response | undefined
  if (request.method === 'GET' || request.method === 'HEAD') {
    if (!user && protectedRoute) {
      const target = descriptor ? new URL(platformOrigin(platform)) : new URL(request.url)
      target.pathname = '/auth/login'; target.search = ''; target.searchParams.set('next', pathname + url.search)
      redirect = Response.redirect(target, 307)
    } else if (user && (pathname === '/auth/login' || pathname === '/auth/signup')) {
      redirect = Response.redirect(new URL(safeNextPath(url.searchParams.get('next'), '/', platform), descriptor ? platformOrigin(platform) : request.url), 307)
    }
  }
  return { requestCookieHeader: Array.from(jar, ([name, value]) => `${name}=${encodeURIComponent(value)}`).join('; '), responseHeaders, redirect }
}
