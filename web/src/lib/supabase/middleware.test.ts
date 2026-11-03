import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ getClaims: vi.fn(), setAll: undefined as undefined | ((cookies: { name: string; value: string; options?: object }[], headers: Record<string, string>) => void) }))
vi.mock('@/lib/env/public', () => ({ publicEnv: { supabaseUrl: 'https://project.supabase.co', supabasePublishableKey: 'test', cookieDomain: 'lvh.me' } }))
vi.mock('@supabase/ssr', async original => ({ ...await original<typeof import('@supabase/ssr')>(), createServerClient: (_url: string, _key: string, options: { cookies: { setAll: typeof state.setAll } }) => { state.setAll = options.cookies.setAll; return { auth: { getClaims: state.getClaims } } } }))
import { updateSession } from './middleware'
import { describeRoute } from '../routing'
beforeEach(() => { state.getClaims.mockReset(); state.getClaims.mockResolvedValue({ data: { claims: null } }) })
describe('session refresh', () => {
  it('keeps marketing and authentication routes public', async () => { expect((await updateSession(new Request('https://edra.test/'))).redirect).toBeUndefined(); expect((await updateSession(new Request('https://edra.test/auth/signup'))).redirect).toBeUndefined() })
  it.each(['/app?tab=home', '/learn/calendar?week=next'])('redirects anonymous protected route %s with destination', async path => { const res = await updateSession(new Request(`https://edra.test${path}`)); expect(res.redirect?.status).toBe(307); expect(res.redirect?.headers.get('location')).toBe(`https://edra.test/auth/login?next=${encodeURIComponent(path)}`) })
  it('uses configured origin and retires both legacy scopes', async () => {
    const res = await updateSession(new Request('https://internal.invalid/magd/students?tab=all', { headers: { cookie: 'sb-project-auth-token.0=stale' } }), describeRoute('staff', '/magd/students?tab=all'))
    expect(res.redirect?.headers.get('location')).toBe('http://app.lvh.me:3000/auth/login?next=%2Fmagd%2Fstudents%3Ftab%3Dall'); expect(res.responseHeaders.getSetCookie()).toHaveLength(2); expect(res.responseHeaders.getSetCookie().some(cookie => cookie.includes('Domain=lvh.me'))).toBe(true); expect(res.responseHeaders.get('cache-control')).toBe('private, no-store')
  })
  it('protects an academy whose valid slug is assets', async () => {
    const res = await updateSession(new Request('http://app.lvh.me:3000/assets/students'), describeRoute('staff', '/assets/students'))
    expect(res.redirect?.headers.get('location')).toBe('http://app.lvh.me:3000/auth/login?next=%2Fassets%2Fstudents')
  })
  it('does not redirect mutations', async () => { const res = await updateSession(new Request('http://app.lvh.me:3000/magd/students', { method: 'POST' }), describeRoute('staff', '/magd/students')); expect(res.redirect).toBeUndefined() })
  it('treats a recovery session as signed out', async () => { state.getClaims.mockResolvedValue({ data: { claims: { sub: 'user-1', amr: [{ method: 'otp', timestamp: 1 }] } } }); expect((await updateSession(new Request('https://edra.test/app'))).redirect?.status).toBe(307); expect((await updateSession(new Request('https://edra.test/auth/login'))).redirect).toBeUndefined() })
  it('redirects authenticated users away from login using safe next', async () => { state.getClaims.mockResolvedValue({ data: { claims: { sub: 'user-1', amr: [{ method: 'password', timestamp: 1 }] } } }); expect((await updateSession(new Request('https://edra.test/auth/login'))).redirect?.headers.get('location')).toBe('https://edra.test/') })
  it('forwards refreshed cookies and cache headers', async () => {
    state.getClaims.mockImplementation(async () => { state.setAll!([{ name: 'session', value: 'fresh', options: { path: '/' } }], { pragma: 'no-cache', expires: '0' }); return { data: { claims: null } } })
    const res = await updateSession(new Request('https://edra.test/api/x', { headers: { cookie: 'session=stale; other=value', authorization: 'Bearer token' } }))
    expect(res.requestCookieHeader).toContain('session=fresh'); expect(res.requestCookieHeader).toContain('other=value'); expect(res.responseHeaders.getSetCookie()[0]).toContain('session=fresh'); expect(res.responseHeaders.get('pragma')).toBe('no-cache'); expect(res.responseHeaders.get('expires')).toBe('0'); expect(res.redirect).toBeUndefined()
  })
})
