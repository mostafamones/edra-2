// @vitest-environment jsdom
// @vitest-environment-options {"url":"http://app.lvh.me:3000/magd/students?x=hello%20world"}
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { useEffect } from 'react'
import { expect, it } from 'vitest'
import Link from '@/components/shared/link'
import { usePathname, useRouter, useSearchParams } from '@/lib/navigation'
import { routerRewrite } from '@/lib/routing/rewrite'

// The real Router, not an adapter: rewrite input/output decides what these public APIs see.
let api: ReturnType<typeof useRouter>
const Page = () => {
  const current = useRouter()
  useEffect(() => { api = current })
  return <p data-testid="at">{usePathname()}|{useSearchParams().get('x')}</p>
}
const root = createRootRoute({ component: () => <><Outlet /><Link href="/magd/exams?x=1">exams</Link><Link href="?x=2">query</Link><Link href="#part">hash</Link><Link href="https://learn.lvh.me:3000/courses" target="_blank">out</Link><Link href={{ pathname: "/magd/exams", query: { x: "a b" }, hash: "top" }} replace scroll={false}>object</Link></> })
const routeTree = root.addChildren([
  createRoute({ getParentRoute: () => root, path: '/app/$academySlug/students', component: Page }),
  createRoute({ getParentRoute: () => root, path: '/app/$academySlug/exams', component: Page }),
])

it('maps public hrefs through the real router rewrite on the staff host', async () => {
  const history = createMemoryHistory({ initialEntries: ['/magd/students?x=hello%20world'] })
  const router = createRouter({ routeTree, history, origin: 'http://app.lvh.me:3000', rewrite: routerRewrite })
  await act(async () => { render(<RouterProvider router={router as never} />) })
  await waitFor(() => expect(screen.getByTestId('at').textContent).toBe('/magd/students|hello world'))
  expect(router.state.location.pathname).toBe('/app/magd/students')

  expect(screen.getByText('exams').getAttribute('href')).toBe('/magd/exams?x=1')
  expect(screen.getByText('query').getAttribute('href')).toBe('/magd/students?x=2')
  expect(screen.getByText('hash').getAttribute('href')).toBe('/magd/students?x=hello+world#part')
  const out = screen.getByText('out')
  expect(out.getAttribute('href')).toBe('https://learn.lvh.me:3000/courses')
  expect(out.getAttribute('target')).toBe('_blank')
  const before = router.state.location.href
  expect(fireEvent.click(out, { ctrlKey: true })).toBe(true)
  expect(router.state.location.href).toBe(before)
  const object = screen.getByText('object')
  expect(object.getAttribute('href')).toBe('/magd/exams?x=a+b#top')
  expect(fireEvent.click(object, { metaKey: true })).toBe(true)
  expect(router.state.location.href).toBe(before)
  await act(async () => { fireEvent.click(object) })
  await waitFor(() => expect(router.state.location.pathname).toBe('/app/magd/exams'))
  expect(history.length).toBe(1)

  const first = api
  await act(async () => { api.push('/magd/exams?x=a%20b#top') })
  await waitFor(() => expect(screen.getByTestId('at').textContent).toBe('/magd/exams|a b'))
  expect(router.state.location.pathname).toBe('/app/magd/exams')
  expect(router.state.location.hash).toBe('top')
  expect(api).toBe(first)
})
