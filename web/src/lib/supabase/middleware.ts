import { createServerClient, serializeCookieHeader } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { safeNextPath } from '../../modules/auth/return-path'
import { platformOrigin, type RouteDescriptor } from '../routing'
import { authCookieOptions, isLegacyAuthCookie } from './cookie-policy'
import { isPhoneCodeSession } from './session-grade'

export async function updateSession(request: NextRequest, descriptor?: RouteDescriptor) {
  let response = NextResponse.next({ request })
  const cookieOptions = authCookieOptions()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions,
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          const previousCookies = response.headers.getSetCookie()
          response = NextResponse.next({ request })
          previousCookies.forEach(cookie => response.headers.append('set-cookie', cookie))
          cookiesToSet.forEach(({ name, value, options }) => response.headers.append('set-cookie', serializeCookieHeader(name, value, options)))
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value))
        },
      },
    }
  )
  const { data } = await supabase.auth.getClaims()
  // A phone-code (recovery) session has no application authority; treat it as signed out.
  const user = data?.claims && !isPhoneCodeSession(data.claims) ? data.claims : null
  const pathname = request.nextUrl.pathname
  const platform = descriptor?.platform === 'student' ? 'student' : 'staff'
  const commonPublic = /^(?:\/auth|\/invite|\/api|\/_next)(?:\/|$)/.test(pathname)
  const protectedRoute = (!commonPublic && descriptor && descriptor.platform !== 'marketing') || /^(?:\/app|\/learn|\/onboarding)(?:\/|$)/.test(pathname)
  response.headers.set('cache-control', 'private, no-store')
  // Retire legacy cookies at both known scopes; never use them as the new session.
  for (const { name } of request.cookies.getAll()) {
    if (!isLegacyAuthCookie(name)) continue
    response.headers.append('set-cookie', serializeCookieHeader(name, '', { path: '/', maxAge: 0 }))
    response.headers.append('set-cookie', serializeCookieHeader(name, '', { ...cookieOptions, maxAge: 0 }))
  }
  function redirect(target: URL) {
    const redirected = NextResponse.redirect(target)
    response.headers.getSetCookie().forEach(cookie => redirected.headers.append('set-cookie', cookie))
    for (const key of ['cache-control', 'pragma', 'expires']) {
      const value = response.headers.get(key)
      if (value) redirected.headers.set(key, value)
    }
    return redirected
  }
  // Server actions and other mutations remain same-origin; their own authorization denies access.
  if (request.method !== 'GET' && request.method !== 'HEAD') return response
  if (!user && protectedRoute) {
    const url = descriptor ? new URL(platformOrigin(platform)) : request.nextUrl.clone()
    url.pathname = '/auth/login'
    url.search = ''
    url.searchParams.set('next', `${pathname}${request.nextUrl.search}`)
    return redirect(url)
  }
  if (user && (pathname === '/auth/login' || pathname === '/auth/signup')) {
    return redirect(new URL(safeNextPath(request.nextUrl.searchParams.get('next'), '/', platform), descriptor ? platformOrigin(platform) : request.url))
  }
  return response
}
