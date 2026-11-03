// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, redirect, RouterProvider, type AnyRouter } from '@tanstack/react-router'
import { afterEach, expect, it, vi } from 'vitest'
const holder = vi.hoisted(() => ({ router: undefined as unknown }))
vi.mock('@tanstack/react-start', async original => ({ ...await original<typeof import('@tanstack/react-start')>(), getRouterInstance: () => holder.router }))
import { navigateFunctionRedirect, runClientFunction } from './start'
import { advanceBrowserScope } from './lib/browser-scope'

// The real router and memory history; only the router lookup is mocked. The wrapped function stands in for a server function that throws a redirect.
const callRedirect = (href: string, method?: 'GET' | 'POST') => navigateFunctionRedirect(async () => { throw redirect({ href }) }, method)
const settle = (ms = 50) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)) })
const noRedirect = vi.fn()
afterEach(() => { cleanup(); noRedirect.mockReset() })
let unmount: () => void = () => {}
function cleanup() { unmount(); unmount = () => {} }

type Hooks = { beforeLoad?: () => Promise<unknown>; loader?: () => Promise<unknown> }
function setup(hooks: Hooks = {}, at = '/', shell?: () => ReactNode) {
  const root = createRootRoute({ component: () => <>{shell?.()}<Outlet /></> })
  const routeTree = root.addChildren([
    createRoute({ getParentRoute: () => root, path: '/', component: () => <p>home</p> }),
    createRoute({ getParentRoute: () => root, path: '/start', ...hooks, component: () => <p>start</p> }),
    createRoute({ getParentRoute: () => root, path: '/target', component: () => <p>target</p> }),
  ])
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [at] }) }) as AnyRouter
  holder.router = router
  return router
}
async function mount(router: AnyRouter) {
  const view = render(<RouterProvider router={router as never} />)
  unmount = view.unmount
  await settle()
}

it('(a) beforeLoad awaiting a redirecting function ends at the target without hanging', { timeout: 5000 }, async () => {
  const router = setup({ beforeLoad: async () => { await callRedirect('/target', 'GET'); noRedirect() } })
  await mount(router)
  await act(async () => { void router.navigate({ href: '/start' }) })
  await settle()
  expect(router.state.location.pathname).toBe('/target')
  expect(router.state.status).toBe('idle')
  expect(screen.queryByText('target')).not.toBeNull()
  expect(noRedirect).not.toHaveBeenCalled()
})

it('(b) loader awaiting a redirecting function ends at the target without hanging', { timeout: 5000 }, async () => {
  const router = setup({ loader: async () => { await callRedirect('/target', 'GET'); noRedirect() } })
  await mount(router)
  await act(async () => { void router.navigate({ href: '/start' }) })
  await settle()
  expect(router.state.location.pathname).toBe('/target')
  expect(router.state.status).toBe('idle')
  expect(screen.queryByText('target')).not.toBeNull()
  expect(noRedirect).not.toHaveBeenCalled()
})

it('(c) a form submit handler navigates to the target, skips the code after the await and releases finally', { timeout: 5000 }, async () => {
  const after = vi.fn(); const released = vi.fn()
  const router = setup({}, '/', () => <form aria-label="f" onSubmit={async event => { event.preventDefault(); try { await callRedirect('/target'); after() } catch { /* the redirect rejection */ } finally { released() } }} />)
  await mount(router)
  expect(router.state.location.pathname).toBe('/')
  await act(async () => { fireEvent.submit(screen.getByRole('form', { name: 'f' })) })
  await settle()
  expect(router.state.location.pathname).toBe('/target')
  expect(router.state.status).toBe('idle')
  expect(after).not.toHaveBeenCalled()
  expect(released).toHaveBeenCalledOnce()
})

it('(d) a redirect to the current location rejects, so a mounted form is not stranded', { timeout: 5000 }, async () => {
  const router = setup({}, '/start')
  await mount(router)
  const settled = vi.fn()
  await act(async () => { await callRedirect('/start').catch(settled) })
  expect(router.state.location.pathname).toBe('/start')
  expect(router.state.status).toBe('idle')
  expect(settled).toHaveBeenCalledOnce()
})

it('(e) a queued redirect releases the queue for a destination loader that awaits queued work', { timeout: 5000 }, async () => {
  const inner = vi.fn(async () => {})
  const root = createRootRoute({ component: () => <Outlet /> })
  const router = createRouter({ routeTree: root.addChildren([
    createRoute({ getParentRoute: () => root, path: '/', component: () => <p>home</p> }),
    createRoute({ getParentRoute: () => root, path: '/target', loader: () => runClientFunction(inner, 'POST'), component: () => <p>target</p> }),
  ]), history: createMemoryHistory({ initialEntries: ['/'] }) }) as AnyRouter
  holder.router = router
  await mount(router)
  const settled = vi.fn()
  await act(async () => { void runClientFunction(async () => { throw redirect({ href: '/target' }) }, 'POST').catch(settled) })
  await settle()
  expect(inner).toHaveBeenCalledOnce()
  expect(settled).toHaveBeenCalledOnce()
  expect(router.state.location.pathname).toBe('/target')
  expect(router.state.status).toBe('idle')
})

it('(f) an old identity redirect does not navigate the new identity', { timeout: 5000 }, async () => {
  const router = setup()
  await mount(router)
  let release = () => {}
  const gate = new Promise<void>(resolve => { release = resolve })
  void runClientFunction(async () => { await gate; throw redirect({ href: '/target' }) }, 'POST').catch(noRedirect)
  await settle()
  advanceBrowserScope(); release()
  await settle()
  expect(router.state.location.pathname).toBe('/')
  expect(noRedirect).not.toHaveBeenCalled()
})

it('(g) an identity switch while the router lookup is pending also drops the old redirect', async () => {
  const router = setup()
  await mount(router)
  let release!: (value: AnyRouter) => void
  holder.router = new Promise<AnyRouter>(resolve => { release = resolve })
  void runClientFunction(async () => { throw redirect({ href: '/target' }) }, 'POST').catch(noRedirect)
  await settle()
  advanceBrowserScope(); release(router)
  await settle()
  expect(router.state.location.pathname).toBe('/')
  expect(noRedirect).not.toHaveBeenCalled()
})

it('(h) a same-origin absolute action redirect keeps Router navigation', async () => {
  const router = setup()
  await mount(router)
  const settled = vi.fn()
  await act(async () => { await runClientFunction(async () => { throw redirect({ href: `${window.location.origin}/target` }) }, 'POST').catch(settled) })
  expect(router.state.location.pathname).toBe('/target')
  expect(settled).toHaveBeenCalledOnce()
})
