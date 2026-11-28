import { classifyHost, describeRoute, platformOrigin, PUBLIC_PATH_HEADER, ROUTE_HEADER } from '../routing'
import { updateSession } from '../supabase/middleware'
import { searchRecord, stringifySearch } from '../../routes/-functions/search'
import { collectResponseCookies, runWithRequestContext } from './request'

const readMethods = new Set(['GET', 'HEAD'])
const infrastructure = /^(?:\/api|\/_serverFn|\/_build)(?:\/|$)|^\/(?:favicon\.ico|robots\.txt|sitemap\.xml|notifications-sw\.js|(?:next|vercel|file|globe|window)\.svg)$/
function cookieKey(cookie: string) {
  const parts = cookie.split(';').map(part => part.trim()); const name = parts[0].split('=', 1)[0]
  const domain = parts.find(part => /^domain=/i.test(part))?.toLowerCase() ?? ''
  const path = parts.find(part => /^path=/i.test(part))?.toLowerCase() ?? ''
  return `${name};${domain};${path}`
}
function merge(response: Response, session: Headers, mutations: string[]) {
  const headers = new Headers(response.headers)
  const cookies = [...session.getSetCookie(), ...headers.getSetCookie(), ...mutations]
  headers.delete('set-cookie')
  const unique = new Map<string, string>()
  for (const cookie of cookies) unique.set(cookieKey(cookie), cookie)
  for (const cookie of unique.values()) headers.append('set-cookie', cookie)
  for (const name of ['cache-control', 'pragma', 'expires']) {
    const value = session.get(name)
    if (value && (name !== 'cache-control' || !/(?:^|,)\s*no-store\s*(?:,|$)/i.test(headers.get(name) ?? ''))) headers.set(name, value)
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}
export async function gateway(request: Request, downstream: (request: Request) => Promise<Response>) {
  const platform = classifyHost(request.headers.get('host') ?? '')
  if (!platform) return new Response('Unknown platform host', { status: 421 })
  const url = new URL(request.url)
  // Router classifies its URL's host; the Host just validated must be the one it sees.
  url.host = request.headers.get('host')!
  // Next rejected undecodable paths and canonicalized repeated and trailing slashes before its proxy ran.
  try { decodeURIComponent(url.pathname) } catch { return new Response('Bad Request', { status: 400 }) }
  const canonicalPath = url.pathname.replace(/\/{2,}/g, '/').replace(/(?<=.)\/$/, '')
  if (canonicalPath !== url.pathname) { url.pathname = canonicalPath; return Response.redirect(url, 308) }
  const publicPath = url.pathname + url.search
  const descriptor = describeRoute(platform, publicPath)
  const legacyPlatform = /^\/app(?:\/|$)/.test(url.pathname) ? 'staff' : /^\/learn(?:\/|$)/.test(url.pathname) ? 'student' : null
  if (legacyPlatform && platform !== legacyPlatform && !readMethods.has(request.method)) return new Response('Use the canonical platform URL', { status: 409 })
  const session = await updateSession(request, descriptor)
  if (legacyPlatform && platform !== legacyPlatform) return merge(Response.redirect(new URL(publicPath, platformOrigin(legacyPlatform)), 307), session.responseHeaders, [])
  if (session.redirect) return merge(session.redirect, session.responseHeaders, [])
  if (!infrastructure.test(url.pathname) && descriptor.legacy) {
    if (!readMethods.has(request.method)) return merge(new Response(platform === 'staff' ? 'Use the canonical academy URL' : 'Use the canonical student URL', { status: 409 }), session.responseHeaders, [])
    if (platform === 'student') { const target = new URL(platformOrigin('student')); target.pathname = url.pathname.slice(6) || '/'; target.search = url.search; return merge(Response.redirect(target, 307), session.responseHeaders, []) }
    // The staff entry page's public path: Router would canonicalize `/app` to `/`, and the trusted header retains the original.
    url.pathname = '/'
  }
  // Router's SSR check redirects any other spelling of a query, which Next never did and which would lose the staff legacy path.
  if (!infrastructure.test(url.pathname)) {
    // Router serializes escapes in uppercase. Normalize only its internal request
    // spelling so a lowercase UTF-8 escape does not add a new public 307.
    url.pathname = url.pathname.replace(/%[a-f\d]{2}/gi, escape => escape.toUpperCase())
    url.search = stringifySearch(searchRecord(url.search))
  }
  const headers = new Headers(request.headers)
  // These client-supplied forwarding headers are not a source of routing authority.
  for (const name of ['forwarded', 'x-forwarded-host', 'x-forwarded-proto']) headers.delete(name)
  headers.set(ROUTE_HEADER, platform); headers.set(PUBLIC_PATH_HEADER, publicPath)
  if (session.requestCookieHeader) headers.set('cookie', session.requestCookieHeader); else headers.delete('cookie')
  const isServerFnPost = request.method === 'POST' && url.pathname.startsWith(process.env.TSS_SERVER_FN_BASE || '/_serverFn/')
  const limit = 1024 * 1024
  const length = request.headers.get('content-length')
  if (isServerFnPost && length && /^\d+$/.test(length) && Number(length) > limit) return merge(new Response('Payload Too Large', { status: 413 }), session.responseHeaders, [])
  let exceeded = false
  let forwarded: Request
  if (isServerFnPost && request.body) {
    let size = 0
    const body = request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ transform(chunk, controller) {
      size += chunk.byteLength
      if (size > limit) { exceeded = true; controller.error(new Error('Payload Too Large')); return }
      controller.enqueue(chunk)
    } }))
    forwarded = new Request(url, { method: request.method, headers, body, duplex: 'half' } as RequestInit)
  } else forwarded = new Request(url, new Request(request, { headers }))
  return runWithRequestContext(forwarded, async () => {
    let response: Response
    try { response = await downstream(forwarded) } catch (error) { if (!exceeded) console.error(error); response = new Response(exceeded ? 'Payload Too Large' : 'Internal Server Error', { status: exceeded ? 413 : 500 }) }
    if (exceeded && response.status !== 413) response = new Response('Payload Too Large', { status: 413 })
    return merge(response, session.responseHeaders, collectResponseCookies())
  })
}
