// Run: node --test mobile/react-native/src/features/access/*.test.ts (Node ≥ 22.18, no dependencies).
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { AuthFailure, SignInFailure } from '../../core/auth.ts'
import { CHUNK_LENGTH, chunkedSecureStorage, type SecureItems } from './chunkedStore.ts'
import { classifySessionError, classifySignInError, nativeAuthFailure, nativeSignInFailure } from './classify.ts'
import { API_ORIGIN_KEY, loadConfiguration, PUBLISHABLE_KEY_KEY, SUPABASE_URL_KEY } from './configuration.ts'

/** Shaped like supabase-js errors (`__isAuthError`, `name`, `status`, `code`). */
const authError = (name: string, status?: number, code?: string) =>
  Object.assign(new Error('server text that must not matter'), { __isAuthError: true, name, status, code })

describe('loadConfiguration (port of iOS AppConfiguration)', () => {
  const valid = {
    [SUPABASE_URL_KEY]: 'https://ref.supabase.co',
    [PUBLISHABLE_KEY_KEY]: ' sb_publishable_x ',
    [API_ORIGIN_KEY]: 'https://edra.example',
  }

  test('valid values load trimmed', () => {
    assert.deepEqual(loadConfiguration(valid, null), {
      configuration: { supabaseUrl: 'https://ref.supabase.co', publishableKey: 'sb_publishable_x', apiOrigin: 'https://edra.example' },
    })
  })

  test('missing, invalid and insecure values report every issue', () => {
    const result = loadConfiguration({ [SUPABASE_URL_KEY]: 'ftp://x', [API_ORIGIN_KEY]: 'http://dev.local:3000' }, null)
    assert.deepEqual(result, {
      issues: [
        `${SUPABASE_URL_KEY} is not a valid URL`,
        `${PUBLISHABLE_KEY_KEY} is not set`,
        `${API_ORIGIN_KEY} must use https in this build`,
      ],
    })
  })

  test('development HTTP is only for listed API hosts, never Supabase', () => {
    const hosts = ['Dev.Local']
    assert.ok('configuration' in loadConfiguration({ ...valid, [API_ORIGIN_KEY]: 'http://dev.local:3000' }, hosts))
    assert.ok('issues' in loadConfiguration({ ...valid, [API_ORIGIN_KEY]: 'http://other.local' }, hosts))
    assert.ok('issues' in loadConfiguration({ ...valid, [SUPABASE_URL_KEY]: 'http://dev.local' }, hosts))
  })
})

describe('classifySessionError (mirrors iOS classify)', () => {
  test('only a missing session or a 4xx rejection code signs out', () => {
    assert.equal(classifySessionError(authError('AuthSessionMissingError', 400)), 'signedOut')
    assert.equal(classifySessionError(authError('AuthApiError', 400, 'refresh_token_not_found')), 'signedOut')
    assert.equal(classifySessionError(authError('AuthApiError', 403, 'session_not_found')), 'signedOut')
    assert.equal(classifySessionError(authError('AuthApiError', 400, 'validation_failed')), 'unavailable')
  })

  test('network, rate limit, server and unknown failures keep credentials', () => {
    assert.equal(classifySessionError(authError('AuthRetryableFetchError', 0)), 'unavailable')
    assert.equal(classifySessionError(authError('AuthApiError', 429, 'refresh_token_not_found')), 'unavailable')
    assert.equal(classifySessionError(authError('AuthApiError', 500, 'session_not_found')), 'unavailable')
    assert.equal(classifySessionError(new TypeError('Network request failed')), 'unavailable')
    // A plain error that merely looks like a session error is not an SDK error.
    assert.equal(classifySessionError({ name: 'AuthSessionMissingError' }), 'unavailable')
  })

  test('aborts and discarded refreshes are cancelled', () => {
    assert.equal(classifySessionError(Object.assign(new Error(), { name: 'AbortError' })), 'cancelled')
    assert.equal(classifySessionError(authError('AuthRefreshDiscardedError')), 'cancelled')
  })
})

describe('sign-in and native failures', () => {
  test('sign-in errors map by code and type', () => {
    assert.equal(classifySignInError(authError('AuthApiError', 400, 'invalid_credentials')), 'invalidCredentials')
    assert.equal(classifySignInError(authError('AuthApiError', 400, 'user_not_found')), 'invalidCredentials')
    assert.equal(classifySignInError(authError('AuthApiError', 429, 'over_request_rate_limit')), 'other')
    assert.equal(classifySignInError(authError('AuthRetryableFetchError', 0)), 'network')
    assert.equal(classifySignInError(new Error('x')), 'other')
  })

  test('native rejection codes map to their failure; unknown codes fall back safely', () => {
    const auth = nativeAuthFailure({ code: 'signedOut' })
    assert.ok(auth instanceof AuthFailure)
    assert.equal(auth.kind, 'signedOut')
    assert.equal(nativeAuthFailure({ code: 'ERR_UNKNOWN' }).kind, 'unavailable')
    const signIn = nativeSignInFailure({ code: 'invalidCredentials' })
    assert.ok(signIn instanceof SignInFailure)
    assert.equal(signIn.kind, 'invalidCredentials')
    assert.equal(nativeSignInFailure(undefined).kind, 'other')
  })
})

class MemoryItems implements SecureItems {
  map = new Map<string, string>()
  failOnSet: string | null = null
  async getItemAsync(key: string) {
    return this.map.get(key) ?? null
  }
  async setItemAsync(key: string, value: string) {
    assert.match(key, /^[\w.-]+$/)
    assert.ok(new TextEncoder().encode(value).length <= 2048, 'secure item over 2048 bytes')
    if (key === this.failOnSet) throw new Error('write failed')
    this.map.set(key, value)
  }
  async deleteItemAsync(key: string) {
    this.map.delete(key)
  }
}

describe('chunkedSecureStorage', () => {
  test('large values with multibyte text round-trip within the item size limit', async () => {
    const items = new MemoryItems()
    const store = chunkedSecureStorage(items)
    const value = JSON.stringify({ name: 'مصطفى 😀'.repeat(400), token: 'x'.repeat(3000) })
    await store.setItem('sb-key', value)
    assert.equal(await store.getItem('sb-key'), value)
    assert.ok(items.map.size > 3)
  })

  test('surrogate pairs at a chunk boundary stay intact', async () => {
    const store = chunkedSecureStorage(new MemoryItems())
    const value = 'a'.repeat(CHUNK_LENGTH - 1) + '😀' + 'b'
    await store.setItem('k', value)
    assert.equal(await store.getItem('k'), value)
  })

  test('overwrite removes old chunks; remove clears everything', async () => {
    const items = new MemoryItems()
    const store = chunkedSecureStorage(items)
    await store.setItem('k', 'x'.repeat(CHUNK_LENGTH * 3))
    await store.setItem('k', 'short')
    assert.equal(await store.getItem('k'), 'short')
    assert.equal(items.map.size, 2)
    await store.removeItem('k')
    assert.equal(items.map.size, 0)
    assert.equal(await store.getItem('k'), null)
  })

  test('an interrupted write keeps the previous value', async () => {
    const items = new MemoryItems()
    const store = chunkedSecureStorage(items)
    await store.setItem('k', 'old')
    items.failOnSet = 'k.2.1'
    await assert.rejects(store.setItem('k', 'y'.repeat(CHUNK_LENGTH * 2)))
    assert.equal(await store.getItem('k'), 'old')
  })

  test('a corrupt manifest or missing chunk reads as no session', async () => {
    const items = new MemoryItems()
    const store = chunkedSecureStorage(items)
    items.map.set('k', 'not json')
    assert.equal(await store.getItem('k'), null)
    await store.setItem('k', 'x'.repeat(CHUNK_LENGTH * 2))
    items.map.delete('k.1.1')
    assert.equal(await store.getItem('k'), null)
  })
})
