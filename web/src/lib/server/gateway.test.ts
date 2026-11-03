import { beforeEach, describe, expect, it, vi } from 'vitest'
const refresh = vi.hoisted(() => vi.fn())
vi.mock('../supabase/middleware', () => ({ updateSession: refresh }))
import { gateway } from './gateway'
import { cookies } from './request'
import { routerRewrite } from '../routing/rewrite'
import { createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
const request = (host: string, path: string, method = 'GET', extra: Record<string, string> = {}) => new Request(`http://${host}${path}`, { method, headers: { host, ...extra } })
const pass = async (req: Request) => new Response(req.url, { headers: { 'x-path': req.headers.get('x-edra-public-path')!, 'x-platform': req.headers.get('x-edra-platform')!, 'x-cookie': req.headers.get('cookie') ?? '' } })
beforeEach(() => { refresh.mockReset(); refresh.mockResolvedValue({ requestCookieHeader: '', responseHeaders: new Headers({ 'cache-control': 'private, no-store' }) }) })
describe('gateway', () => {
  it('absorbs Router escape casing without adding a public redirect or changing the trusted original path', async () => {
    const raw = '/academy/%d9%85?q=1'
    const response = await gateway(request('app.lvh.me:3000', raw), async forwarded => {
      expect(forwarded.headers.get('x-edra-public-path')).toBe(raw)
      const url = new URL(forwarded.url), root = createRootRoute()
      const page = createRoute({ getParentRoute: () => root, path: '/app/$academySlug/$id' })
      const router = createRouter({ routeTree: root.addChildren([page]), isServer: true, origin: url.origin, rewrite: routerRewrite,
        history: createMemoryHistory({ initialEntries: [url.pathname + url.search] }) })
      await router.load()
      const result = router._serverResult as { type: string; redirect?: Response; status?: number } | undefined
      return result?.redirect ?? new Response('rendered', { status: result?.status ?? 500 })
    })
    expect(response.status).toBe(200); expect(response.headers.get('location')).toBeNull()
  })
  it('rejects unknown actual host', async () => { const response = await gateway(request('evil.example', '/', 'GET', { 'x-forwarded-host': 'app.lvh.me:3000' }), pass); expect(response.status).toBe(421); expect(await response.text()).toBe('Unknown platform host'); expect(refresh).not.toHaveBeenCalled() })
  it('overwrites untrusted routing headers and forwards refreshed cookies', async () => {
    refresh.mockResolvedValue({ requestCookieHeader: 'session=fresh', responseHeaders: new Headers({ 'set-cookie': 'session=fresh; Path=/', 'cache-control': 'private, no-store' }) })
    const response = await gateway(request('learn.lvh.me:3000', '/profile?x=1', 'GET', { 'x-edra-platform': 'staff', 'x-edra-public-path': '/spoof' }), pass)
    expect(response.headers.get('x-platform')).toBe('student'); expect(response.headers.get('x-path')).toBe('/profile?x=1'); expect(response.headers.get('x-cookie')).toBe('session=fresh'); expect(response.headers.getSetCookie()).toHaveLength(1)
  })
  it.each(['/api/x', '/_serverFn/id', '/favicon.ico', '/assets/missing.svg', '/profile'])('sanitizes routing headers on %s', async path => {
    const response = await gateway(request('learn.lvh.me:3000', path, 'POST', { 'x-edra-platform': 'staff', 'x-edra-public-path': '/spoof', 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https', forwarded: 'host=evil.example;proto=https' }), async req => {
      expect(req.headers.get('x-edra-platform')).toBe('student')
      expect(req.headers.get('x-edra-public-path')).toBe(path)
      for (const name of ['forwarded', 'x-forwarded-host', 'x-forwarded-proto']) expect(req.headers.has(name)).toBe(false)
      return new Response('ok')
    })
    expect(response.status).toBe(200)
  })
  it.each(['lvh.me:3000', 'app.lvh.me:3000', 'learn.lvh.me:3000'])('handles legacy paths on %s', async host => {
    for (const path of ['/app/a?q=1', '/learn/a?q=1']) {
      const post = await gateway(request(host, path, 'POST'), pass); expect(post.status).toBe(409); expect(post.headers.get('location')).toBeNull()
      const get = await gateway(request(host, path), pass)
      if (host === 'app.lvh.me:3000' && path.startsWith('/app')) { expect(get.status).toBe(200); expect(await get.text()).toContain('http://app.lvh.me:3000/?q=1') }
      else { expect(get.status).toBe(307); expect(get.headers.get('location')).toContain('?q=1') }
    }
  })
  it('retains separate cookie scopes and route cookie mutations on redirects, errors and server functions', async () => {
    const h = new Headers({ 'cache-control': 'private, no-store' }); h.append('set-cookie', 'session=; Path=/; Max-Age=0'); h.append('set-cookie', 'session=fresh; Domain=lvh.me; Path=/')
    refresh.mockResolvedValue({ requestCookieHeader: 'session=fresh', responseHeaders: h })
    for (const status of [302, 500, 200]) {
      const response = await gateway(request('app.lvh.me:3000', '/_serverFn/id', 'POST'), async () => { (await cookies()).set('other', 'yes', { path: '/' }); return new Response(null, { status, headers: status === 302 ? { location: '/' } : {} }) })
      expect(response.headers.getSetCookie()).toHaveLength(3); expect(response.headers.get('cache-control')).toBe('private, no-store')
    }
    const thrown = await gateway(request('app.lvh.me:3000', '/api/v1/x'), async () => { (await cookies()).set('other', 'yes', { path: '/' }); throw Error('test') })
    expect(thrown.status).toBe(500); expect(thrown.headers.getSetCookie()).toHaveLength(3)
  })
  it('does not buffer streams and preserves stricter response cache policy', async () => {
    let pulls = 0; const stream = new ReadableStream({ pull(controller) { pulls++; controller.enqueue(new TextEncoder().encode('x')); controller.close() } })
    const response = await gateway(request('app.lvh.me:3000', '/api/v1/x', 'POST', { authorization: 'Bearer token' }), async req => { expect(req.headers.get('authorization')).toBe('Bearer token'); return new Response(stream, { headers: { 'cache-control': 'no-store' } }) })
    expect(response.headers.get('cache-control')).toBe('no-store'); expect(await response.text()).toBe('x'); expect(pulls).toBe(1)
  })
  it('forwards a canonical query and keeps the public path', async () => {
    const legacy = await gateway(request('app.lvh.me:3000', '/app/x?q=a%20b&next=/a'), pass)
    expect(await legacy.text()).toBe('http://app.lvh.me:3000/?q=a+b&next=%2Fa'); expect(legacy.headers.get('x-path')).toBe('/app/x?q=a%20b&next=/a')
    expect(await (await gateway(request('app.lvh.me:3000', '/api/x?q=a%20b'), pass)).text()).toBe('http://app.lvh.me:3000/api/x?q=a%20b')
  })
  it('classifies the session descriptor from Host and maps each platform root', async () => {
    await gateway(request('app.lvh.me:3000', '/magd/schedules/a%2Fb/edit?year=2026'), async req => {
      expect(routerRewrite.input({ url: new URL(req.url) }).href).toBe('http://app.lvh.me:3000/app/magd/schedules/a%2Fb/edit?year=2026')
      return new Response()
    })
    expect(refresh.mock.calls[0][1]).toMatchObject({ platform: 'staff', scope: 'academy', academySlug: 'magd' })
    for (const [host, root] of [['lvh.me:3000', '/'], ['app.lvh.me:3000', '/app'], ['learn.lvh.me:3000', '/learn']]) {
      const url = await (await gateway(request(host, '/'), pass)).text()
      expect(routerRewrite.input({ url: new URL(url) }).pathname).toBe(root)
    }
  })
  it('redirects a legacy path to the exact owning-platform URL', async () => {
    expect((await gateway(request('lvh.me:3000', '/app/students?search=test'), pass)).headers.get('location')).toBe('http://app.lvh.me:3000/app/students?search=test')
    expect((await gateway(request('app.lvh.me:3000', '/learn/courses?q=1'), pass)).headers.get('location')).toBe('http://learn.lvh.me:3000/learn/courses?q=1')
    expect((await gateway(request('learn.lvh.me:3000', '/learn/courses?q=1'), pass)).headers.get('location')).toBe('http://learn.lvh.me:3000/courses?q=1')
  })
  it('forwards the validated Host as the URL authority', async () => {
    const req = new Request('http://internal.invalid/about', { headers: { host: 'lvh.me:3000' } })
    expect(await (await gateway(req, pass)).text()).toBe('http://lvh.me:3000/about')
  })
  it('composes staff routing from Host when the upstream URL uses an internal origin', async () => {
    const req = new Request('http://internal.invalid/academy/students?q=1', { headers: { host: 'app.lvh.me:3000' } })
    const response = await gateway(req, async forwarded => {
      expect(forwarded.url).toBe('http://app.lvh.me:3000/academy/students?q=1')
      expect(forwarded.headers.get('x-edra-platform')).toBe('staff')
      expect(forwarded.headers.get('x-edra-public-path')).toBe('/academy/students?q=1')
      expect(routerRewrite.input({ url: new URL(forwarded.url) }).pathname).toBe('/app/academy/students')
      return new Response('staff')
    })
    expect(response.status).toBe(200); expect(response.headers.get('location')).toBeNull()
  })
  it('preserves a canonical staff POST body and path through routing composition', async () => {
    const req = new Request('http://internal.invalid/academy/students?x=1', { method: 'POST', headers: { host: 'app.lvh.me:3000' }, body: 'payload' })
    const response = await gateway(req, async forwarded => {
      expect(forwarded.method).toBe('POST'); expect(await forwarded.text()).toBe('payload')
      expect(forwarded.headers.get('x-edra-public-path')).toBe('/academy/students?x=1')
      expect(routerRewrite.input({ url: new URL(forwarded.url) }).pathname).toBe('/app/academy/students')
      return new Response('ok')
    })
    expect(response.status).toBe(200); expect(response.headers.get('location')).toBeNull()
  })
  it.each([['/a/', '/a'], ['/a//b?q=1', '/a/b?q=1'], ['//evil.example/', '/evil.example'], ['/api/v1/academies/', '/api/v1/academies']])('308s %s before the session runs', async (path, target) => {
    const res = await gateway(request('app.lvh.me:3000', path, 'POST'), pass)
    expect(res.status).toBe(308); expect(res.headers.get('location')).toBe(`http://app.lvh.me:3000${target}`); expect(refresh).not.toHaveBeenCalled()
  })
  it('rejects an undecodable path', async () => { const res = await gateway(request('app.lvh.me:3000', '/api/sessions/%E0%A4%A'), pass); expect(res.status).toBe(400); expect(refresh).not.toHaveBeenCalled() })
  it('never turns a legacy student path into an external authority', async () => { const res = await gateway(request('learn.lvh.me:3000', '/learn//evil.example'), pass); expect(new URL(res.headers.get('location')!).origin).toBe('http://learn.lvh.me:3000') })
})
describe('rewrite', () => {
  it.each([['lvh.me:3000', '/about', '/about'], ['app.lvh.me:3000', '/', '/app'], ['app.lvh.me:3000', '/magd/a%2Fb', '/app/magd/a%2Fb'], ['learn.lvh.me:3000', '/profile', '/learn/profile'], ['learn.lvh.me:3000', '/magd/content', '/learn/academy/magd/content'], ['app.lvh.me:3000', '/api/x', '/api/x']])('round trips %s%s', (host, path, internal) => {
    const publicUrl = new URL(`http://${host}${path}?q=a%2Fb#part`); const next = routerRewrite.input({ url: publicUrl }); expect(next.pathname).toBe(internal); expect(routerRewrite.output({ url: next }).href).toBe(publicUrl.href)
  })
})
describe('server function upload limit', () => {
  it('rejects advertised bodies over 1 MiB after session refresh', async () => {
    const response = await gateway(request('app.lvh.me:3000', '/_serverFn/id', 'POST', { 'content-length': '1048577' }), pass)
    expect(response.status).toBe(413); expect(response.headers.get('cache-control')).toBe('private, no-store'); expect(refresh).toHaveBeenCalled()
  })
  it('limits unknown length streams without buffering the body', async () => {
    let read = 0
    const body = new ReadableStream<Uint8Array>({ pull(controller) { if (read++ < 3) controller.enqueue(new Uint8Array(524288)); else controller.close() } })
    const req = new Request('http://app.lvh.me:3000/_serverFn/id', { method: 'POST', headers: { host: 'app.lvh.me:3000' }, body, duplex: 'half' } as RequestInit)
    const response = await gateway(req, async input => { await input.arrayBuffer(); return new Response('ok') })
    expect(response.status).toBe(413); expect(response.headers.get('cache-control')).toBe('private, no-store')
  })
})
it('supports only the exact development tunnel and leaves API paths untouched', async () => {
  vi.stubEnv('EDRA_DEV_TUNNEL_HOST', 'tunnel.example.net:3000')
  try {
    const accepted = await gateway(request('tunnel.example.net:3000', '/magd/students'), pass)
    expect(accepted.headers.get('x-platform')).toBe('staff')
    expect((await gateway(request('tunnel.example.net:3001', '/magd/students'), pass)).status).toBe(421)
    vi.stubEnv('EDRA_DEV_TUNNEL_HOST', '')
    expect((await gateway(request('tunnel.example.net:3000', '/magd/students'), pass)).status).toBe(421)
    const api = await gateway(request('app.lvh.me:3000', '/api/v1/students', 'POST'), pass)
    expect(await api.text()).toBe('http://app.lvh.me:3000/api/v1/students')
  } finally { vi.unstubAllEnvs() }
})
