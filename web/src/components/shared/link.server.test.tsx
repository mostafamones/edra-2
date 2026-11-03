import { renderToString } from 'react-dom/server'
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { expect, it } from 'vitest'
import Link from './link'

// Runs without `window`, as SSR does: this output must equal the client's or hydration keeps the wrong attributes.
it('makes the same same-origin decision on the server as in the browser', async () => {
  const root = createRootRoute({ component: () => <><Link href="http://app.lvh.me:3000/magd/exams?x=1">same</Link><Link href="//app.lvh.me:3000/magd/exams?x=2">protocol-relative</Link><Link href="https://outside.example/a">out</Link><Link href="?page=2">query</Link></> })
  const router = createRouter({ routeTree: root, origin: 'http://app.lvh.me:3000', isServer: true, history: createMemoryHistory({ initialEntries: ['/magd/exams?page=1'] }) })
  await router.load()
  const html = renderToString(<RouterProvider router={router as never} />)
  expect(html).toContain('href="/magd/exams?x=1"')
  expect(html).toContain('href="/magd/exams?x=2"')
  expect(html).toContain('href="https://outside.example/a"')
  expect(html).toContain('href="/magd/exams?page=2"')
})
