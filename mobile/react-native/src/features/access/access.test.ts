// Run: node --test mobile/react-native/src/features/access/*.test.ts (Node ≥ 22.18, no dependencies).
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { AuthFailure, SignInFailure, type AuthAuthority, type AuthFailureKind, type SignInFailureKind } from '../../core/auth.ts'
import { AccountScope, type AcademyContext } from '../../core/ownership.ts'
import { ControlledFetch, errorJSON, makeClient, ScriptedAuth } from '../../core/testing.ts'
import { AcademiesController, AuthController, normalizeEgyptianPhone, type SelectionStore } from './index.ts'

const tick = () => new Promise((r) => setImmediate(r))

class FakeAuthority implements AuthAuthority {
  hasSession = false
  restoreFailure: AuthFailureKind | null = null
  failuresLeft = Infinity
  signInFailure: SignInFailureKind | null = null
  restoreCalls = 0
  signOutCalls = 0
  signedInPhone: string | null = null
  private held: (() => void) | null = null
  hold = false

  async restoreSession() {
    this.restoreCalls += 1
    if (this.hold) await new Promise<void>((r) => (this.held = r))
    if (this.restoreFailure && this.failuresLeft > 0) {
      this.failuresLeft -= 1
      throw new AuthFailure(this.restoreFailure)
    }
    if (!this.hasSession) throw new AuthFailure('signedOut')
  }
  async signIn(phone: string) {
    if (this.hold) await new Promise<void>((r) => (this.held = r))
    if (this.signInFailure) throw new SignInFailure(this.signInFailure)
    this.signedInPhone = phone
  }
  async accessToken() {
    return 'token'
  }
  async signOut() {
    this.signOutCalls += 1
  }
  release() {
    this.held?.()
    this.held = null
  }
}

class MemoryStore implements SelectionStore {
  value: string | null = null
  read() {
    return this.value
  }
  write(id: string) {
    this.value = id
  }
  clear() {
    this.value = null
  }
}

function makeAuth(configure: (a: FakeAuthority) => void = () => {}) {
  const authority = new FakeAuthority()
  configure(authority)
  const store = new MemoryStore()
  return { authority, store, model: new AuthController({ authority, selection: store }) }
}

describe('AuthController', () => {
  test('restore without a session signs out and clears it', async () => {
    const { model, authority } = makeAuth()
    await model.restore()
    assert.equal(model.state, 'signedOut')
    assert.equal(authority.signOutCalls, 1)
  })

  test('restore with a session authenticates with a scope', async () => {
    const { model } = makeAuth((a) => (a.hasSession = true))
    await model.restore()
    assert.equal(model.state, 'authenticated')
    assert.ok(model.scope?.isActive)
  })

  test('unavailable restore keeps credentials; retry succeeds', async () => {
    const { model, authority } = makeAuth((a) => {
      a.hasSession = true
      a.restoreFailure = 'unavailable'
      a.failuresLeft = 1
    })
    await model.restore()
    assert.equal(model.state, 'restoreFailed')
    assert.equal(model.scope, null)
    await model.retryRestore()
    assert.equal(model.state, 'authenticated')
    assert.equal(authority.signOutCalls, 0)
  })

  test('a discarded refresh is retryable and never signs out', async () => {
    const { model, authority } = makeAuth((a) => {
      a.hasSession = true
      a.restoreFailure = 'cancelled'
      a.failuresLeft = 1
    })
    await model.restore()
    assert.equal(model.state, 'restoreFailed')
    await model.retryRestore()
    assert.equal(model.state, 'authenticated')
    assert.equal(authority.signOutCalls, 0)
  })

  test('concurrent restore calls share one attempt', async () => {
    const { model, authority } = makeAuth((a) => {
      a.hasSession = true
      a.hold = true
    })
    const first = model.restore()
    await tick()
    await model.restore()
    authority.release()
    await first
    assert.equal(authority.restoreCalls, 1)
    assert.equal(model.state, 'authenticated')
  })

  test('sign-out during restore is not undone by its late completion', async () => {
    const { model, authority } = makeAuth((a) => {
      a.hasSession = true
      a.hold = true
    })
    const restore = model.restore()
    await tick()
    await model.signOut()
    authority.release()
    await restore
    assert.equal(model.state, 'signedOut')
    assert.equal(model.scope, null)
  })

  test('a sign-in completing after sign-out stays signed out and drops its session', async () => {
    const { model, authority } = makeAuth()
    await model.restore()
    authority.hold = true
    const signIn = model.signIn('01001234567', 'x')
    await tick()
    await model.signOut()
    const before = authority.signOutCalls
    authority.release()
    await signIn
    assert.equal(model.state, 'signedOut')
    assert.equal(model.scope, null)
    assert.equal(authority.signOutCalls, before + 1)
  })

  test('sign-in normalizes the phone', async () => {
    const { model, authority } = makeAuth()
    await model.restore()
    await model.signIn('0100 123 4567', 'x')
    assert.equal(authority.signedInPhone, '+201001234567')
    assert.equal(model.state, 'authenticated')
  })

  test('invalid phone or empty password never call the authority', async () => {
    const { model, authority } = makeAuth()
    await model.restore()
    await model.signIn('', 'x')
    assert.equal(model.phoneError, 'Enter your phone number.')
    await model.signIn('123', 'x')
    assert.equal(model.phoneError, 'Enter a valid Egyptian mobile number.')
    await model.signIn('01001234567', '')
    assert.equal(model.errorMessage, 'Enter your password.')
    assert.equal(authority.signedInPhone, null)
    assert.equal(model.state, 'signedOut')
  })

  test('sign-in failures stay signed out with a message', async () => {
    for (const [kind, message] of [
      ['invalidCredentials', 'Wrong phone number or password.'],
      ['network', "Can't reach the server. Check your connection and try again."],
      ['other', "Couldn't sign in. Please try again."],
    ] as const) {
      const { model } = makeAuth((a) => (a.signInFailure = kind))
      await model.restore()
      await model.signIn('01001234567', 'bad')
      assert.equal(model.state, 'signedOut')
      assert.equal(model.errorMessage, message)
    }
  })

  test('sign-out ends the scope first and clears the remembered selection', async () => {
    const { model, authority, store } = makeAuth((a) => (a.hasSession = true))
    store.value = 'A'
    await model.restore()
    const scope = model.scope!
    await model.signOut()
    assert.equal(scope.isActive, false)
    assert.equal(store.value, null)
    assert.equal(authority.signOutCalls, 1)
    assert.equal(model.state, 'signedOut')
  })

  test('a stale scope cannot sign out the next account', async () => {
    const { model, authority } = makeAuth((a) => (a.hasSession = true))
    await model.restore()
    const first = model.scope!
    await model.signOut()
    await model.signIn('01001234567', 'x')
    const second = model.scope!
    await model.signOutFrom(first)
    assert.equal(model.state, 'authenticated')
    assert.equal(model.scope, second)
    assert.equal(authority.signOutCalls, 1)
    await model.signOutFrom(second)
    assert.equal(model.state, 'signedOut')
  })
})

describe('normalizeEgyptianPhone', () => {
  test('normalizes', () => {
    for (const [input, expected] of [
      ['01001234567', '+201001234567'],
      ['+20 100 123 4567', '+201001234567'],
      ['00201001234567', '+201001234567'],
      ['201101234567', '+201101234567'],
      ['(010) 0123-4567', '+201001234567'],
    ]) assert.equal(normalizeEgyptianPhone(input!), expected)
  })
  test('rejects', () => {
    for (const input of ['', '123', '01301234567', '0100123456']) assert.equal(normalizeEgyptianPhone(input), null)
  })
})

const academiesJSON = (ids: string[]) =>
  JSON.stringify({ academies: ids.map((id) => ({ id, name: `Academy ${id}`, slug: id.toLowerCase(), icon: 'school', role: 'instructor' })) })

function makeAcademies(options: { scope?: AccountScope; dirty?: () => boolean; tokens?: string[] } = {}) {
  const fetch = new ControlledFetch()
  const scope = options.scope ?? new AccountScope()
  const store = new MemoryStore()
  const log: string[] = []
  const contexts: Array<AcademyContext | null> = []
  const model = new AcademiesController({
    api: makeClient(new ScriptedAuth(options.tokens ?? Array(20).fill('t')), fetch),
    scope,
    selection: store,
    onUnauthenticated: () => void log.push('signOut'),
    hasUnsavedChanges: options.dirty,
    onContextChange: (c) => void contexts.push(c),
  })
  return { fetch, scope, store, log, contexts, model }
}

async function loaded(ids: string[], options: Parameters<typeof makeAcademies>[0] = {}) {
  const env = makeAcademies(options)
  const load = env.model.load()
  await env.fetch.waitFor(1)
  env.fetch.respond(0, 200, academiesJSON(ids))
  await load
  return env
}

describe('AcademiesController', () => {
  test('an older authorized response cannot restore a removed academy', async () => {
    const { model, fetch } = makeAcademies()
    const older = model.load()
    await fetch.waitFor(1)
    const newer = model.load()
    await fetch.waitFor(2)
    fetch.respond(1, 200, academiesJSON(['A']))
    await newer
    fetch.respond(0, 200, academiesJSON(['A', 'B']))
    await older
    assert.deepEqual(model.academies.map((a) => a.id), ['A'])
    assert.equal(model.state.kind, 'loaded')
  })

  test('loads finishing in reverse order keep the newest', async () => {
    const { model, fetch } = makeAcademies()
    const older = model.load()
    await fetch.waitFor(1)
    const newer = model.load()
    await fetch.waitFor(2)
    fetch.respond(0, 200, academiesJSON(['A', 'B']))
    await older
    assert.equal(model.state.kind, 'loading')
    fetch.respond(1, 200, academiesJSON(['B']))
    await newer
    assert.equal(model.context?.academyId, 'B')
  })

  test('a selection made during a load is kept and persisted', async () => {
    const { model, fetch, store } = await loaded(['A', 'B'])
    assert.equal(model.context?.academyId, 'A')
    const revalidation = model.load()
    await fetch.waitFor(2)
    model.select('B')
    fetch.respond(1, 200, academiesJSON(['A', 'B']))
    await revalidation
    assert.equal(model.context?.academyId, 'B')
    assert.equal(store.value, 'B')
  })

  test('the remembered academy is restored only if the server grants it', async () => {
    const granted = makeAcademies()
    granted.store.value = 'B'
    const a = granted.model.load()
    await granted.fetch.waitFor(1)
    granted.fetch.respond(0, 200, academiesJSON(['A', 'B']))
    await a
    assert.equal(granted.model.context?.academyId, 'B')

    const revoked = makeAcademies()
    revoked.store.value = 'C'
    const b = revoked.model.load()
    await revoked.fetch.waitFor(1)
    revoked.fetch.respond(0, 200, academiesJSON(['A', 'B']))
    await b
    assert.equal(revoked.model.context?.academyId, 'A')
  })

  test('reselecting keeps the context; A → B → A is a new one', async () => {
    const { model, contexts } = await loaded(['A', 'B'])
    const context = model.context!
    model.select('A')
    assert.equal(model.context, context)
    assert.equal(contexts.length, 1)
    model.select('B')
    model.select('A')
    assert.notEqual(model.context, context)
    assert.equal(model.isCurrent(context), false)
    assert.equal(contexts.length, 3)
  })

  test('a revoked selection falls back to a granted academy', async () => {
    const { model, fetch } = await loaded(['A', 'B'])
    model.select('B')
    const before = model.context!
    const revalidated = model.revalidate()
    await fetch.waitFor(2)
    fetch.respond(1, 200, academiesJSON(['A']))
    assert.equal(await revalidated, false)
    assert.equal(model.context?.academyId, 'A')
    assert.equal(model.isCurrent(before), false)
  })

  test('network failure keeps granted academies; without any it fails', async () => {
    const { model, fetch } = await loaded(['A'])
    const revalidated = model.revalidate()
    await fetch.waitFor(2)
    fetch.fail(1)
    assert.equal(await revalidated, true)
    assert.deepEqual(model.academies.map((a) => a.id), ['A'])
    assert.equal(model.state.kind, 'loaded')

    const fresh = makeAcademies()
    const load = fresh.model.load()
    await fresh.fetch.waitFor(1)
    fresh.fetch.fail(0)
    await load
    assert.equal(fresh.model.state.kind, 'failed')
  })

  test('403 drops every academy and the selection', async () => {
    const { model, fetch, contexts } = await loaded(['A'])
    const load = model.load()
    await fetch.waitFor(2)
    fetch.respond(1, 403, errorJSON('FORBIDDEN'))
    await load
    assert.equal(model.academies.length, 0)
    assert.equal(model.context, null)
    assert.equal(contexts.at(-1), null)
    assert.equal(model.state.kind, 'loaded')
  })

  test('401 after a forced refresh uses the scope-bound sign-out', async () => {
    const { model, fetch, log } = makeAcademies()
    const load = model.load()
    await fetch.waitFor(1)
    fetch.respond(0, 401, '')
    await fetch.waitFor(2)
    fetch.respond(1, 401, '')
    await load
    assert.deepEqual(log, ['signOut'])
  })

  test('an ended scope ignores a late success and a late 401', async () => {
    const { model, fetch, scope, store, log } = makeAcademies()
    const success = model.load()
    await fetch.waitFor(1)
    const unauthorized = model.load()
    await fetch.waitFor(2)
    scope.end() // aborts both requests
    await Promise.all([success, unauthorized])
    fetch.respond(0, 200, academiesJSON(['A']))
    assert.equal(model.academies.length, 0)
    assert.equal(store.value, null)
    assert.deepEqual(log, [])
  })

  test('a discarded refresh (cancelled) is not reported as a failure', async () => {
    const { model, fetch } = await loaded(['A'], { tokens: ['t', 'cancelled'] })
    await model.load()
    assert.equal(fetch.calls.length, 1)
    assert.equal(model.state.kind, 'loaded')
    assert.deepEqual(model.academies.map((a) => a.id), ['A'])
  })

  test('an unreadable list fails instead of committing', async () => {
    const { model, fetch } = makeAcademies()
    const load = model.load()
    await fetch.waitFor(1)
    fetch.respond(0, 200, JSON.stringify({ academies: [{ id: 'A' }] }))
    await load
    assert.equal(model.state.kind, 'failed')
    assert.equal(model.academies.length, 0)
  })

  test('switching away from unsaved work waits for a choice', async () => {
    let dirty = true
    const { model } = await loaded(['A', 'B'], { dirty: () => dirty })
    assert.equal(model.choose('A'), 'selected') // reselecting never asks
    assert.equal(model.choose('B'), 'confirm')
    assert.equal(model.context?.academyId, 'A')
    model.dismissPendingSwitch()
    assert.equal(model.pendingAcademy, null)
    assert.equal(model.choose('B'), 'confirm')
    dirty = false // saved or discarded
    model.confirmPendingSwitch()
    assert.equal(model.context?.academyId, 'B')
    assert.equal(model.pendingAcademy, null)
  })

  test('a pending switch to an academy no longer granted does nothing', async () => {
    const { model, fetch } = await loaded(['A', 'B'], { dirty: () => true })
    model.choose('B')
    const load = model.load()
    await fetch.waitFor(2)
    fetch.respond(1, 200, academiesJSON(['A']))
    await load
    model.confirmPendingSwitch()
    assert.equal(model.context?.academyId, 'A')
  })
})
