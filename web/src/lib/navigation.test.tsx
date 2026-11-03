// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const router = vi.hoisted(() => ({ navigate: vi.fn(), invalidate: vi.fn(), clearCache: vi.fn(), preloadRoute: vi.fn(), history: { back: vi.fn(), forward: vi.fn() } }))
vi.mock('@tanstack/react-router', async original => ({ ...await original<typeof import('@tanstack/react-router')>(), useRouter: () => router, useLocation: ({ select }: { select: (location: { publicHref: string; searchStr: string }) => unknown }) => select({ publicHref: '/magd/students?x=hello%20world', searchStr: '?x=hello%20world' }) }))
import { redirect, notFound, usePathname, useRouter, useSearchParams } from './navigation'
beforeEach(() => { vi.clearAllMocks(); router.preloadRoute.mockResolvedValue(undefined) })
afterEach(() => vi.unstubAllGlobals())
it('uses public hrefs, raw search and invalidates on refresh', () => {
  const { result } = renderHook(() => ({ router: useRouter(), path: usePathname(), search: useSearchParams() }))
  expect(result.current.path).toBe('/magd/students'); expect(result.current.search.get('x')).toBe('hello world')
  result.current.router.push('/magd/students?x=1'); expect(router.navigate).toHaveBeenCalledWith(expect.objectContaining({ href: '/magd/students?x=1' }))
  result.current.router.replace('/magd', { transitionTypes: ['academy-join'] }); expect(router.navigate).toHaveBeenLastCalledWith(expect.objectContaining({ replace: true, viewTransition: { types: ['academy-join'] } }))
  router.invalidate.mockReturnValue('refreshed'); expect(result.current.router.refresh()).toBe('refreshed'); expect(router.clearCache).toHaveBeenCalledOnce(); expect(router.invalidate).toHaveBeenCalledOnce()
  result.current.router.prefetch('/magd'); expect(router.preloadRoute).toHaveBeenCalledWith({ href: '/magd' })
})
it('throws Router redirect and not-found signals', () => {
  try { redirect('/auth/login', 303) } catch (error) { expect(error).toBeInstanceOf(Response); expect((error as Response).status).toBe(303); expect((error as Response).headers.get('location')).toBe('/auth/login') }
  expect(() => notFound()).toThrow(expect.objectContaining({ isNotFound: true }))
})
it('preserves legacy URLs through document navigation and skips their prefetch', () => {
  const assign = vi.fn(), replace = vi.fn()
  vi.stubGlobal('window', { location: { href: 'https://app.test/current', origin: 'https://app.test', assign, replace } })
  const { result } = renderHook(useRouter)
  result.current.push('/app/students?q=a%20b')
  result.current.replace('/learn/courses?q=2')
  result.current.prefetch('/app/students')
  expect(assign).toHaveBeenCalledWith('/app/students?q=a%20b')
  expect(replace).toHaveBeenCalledWith('/learn/courses?q=2')
  expect(router.navigate).not.toHaveBeenCalled(); expect(router.preloadRoute).not.toHaveBeenCalled()
})
