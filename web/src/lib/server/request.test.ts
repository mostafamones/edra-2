import { expect, it } from 'vitest'
import { cookies, headers, collectResponseCookies, requestCache, runWithRequestContext } from './request'
it('isolates concurrent cookies and memoized tenant data', async () => {
  let calls = 0; const cached = requestCache((key: string) => `${key}:${++calls}`)
  const run = (name: string) => runWithRequestContext(new Request('http://localhost/', { headers: { cookie: `tenant=${name}` } }), async () => {
    const store = await cookies(); const first = cached('same'); await Promise.resolve(); store.set('result', name, { path: '/' })
    expect(cached('same')).toBe(first); expect((await headers()).get('cookie')).toBe(`tenant=${name}`)
    return [store.get('tenant')?.value, store.get('result')?.value, collectResponseCookies()[0], first]
  })
  const [a, b] = await Promise.all([run('a'), run('b')]); expect(a[0]).toBe('a'); expect(b[0]).toBe('b'); expect(a[1]).toBe('a'); expect(b[1]).toBe('b'); expect(a[2]).toContain('result=a'); expect(b[2]).toContain('result=b'); expect(a[3]).not.toBe(b[3])
})

it('scopes nested contexts and caches object keys by identity', () => {
  let calls = 0
  const cached = requestCache((key: object) => ({ key, count: ++calls }))
  const key = {}
  runWithRequestContext(new Request('http://localhost/outer'), () => {
    const first = cached(key)
    expect(cached(key)).toBe(first)
    expect(cached({})).not.toBe(first)
    runWithRequestContext(new Request('http://localhost/inner'), () => expect(cached(key)).not.toBe(first))
    expect(cached(key)).toBe(first)
  })
  expect(() => cached(key)).toThrow('Request context is unavailable')
})
