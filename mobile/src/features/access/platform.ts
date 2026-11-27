// Android (and any non-iOS) adapter. iOS resolves `platform.ios.ts` instead.
import 'react-native-url-polyfill/auto' // supabase-js assigns URL.protocol, which RN's URL lacks
import { createClient, processLock } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'
import { AppState } from 'react-native'
import { AuthFailure, SignInFailure, type AuthAuthority } from '../../core/auth.ts'
import type { SelectionStore } from './auth.ts'
import { chunkedSecureStorage } from './chunkedStore.ts'
import { classifySessionError, classifySignInError } from './classify.ts'
import { API_ORIGIN_KEY, loadConfiguration, PUBLISHABLE_KEY_KEY, SUPABASE_URL_KEY } from './configuration.ts'
import type { PlatformAccess } from './platformTypes.ts'

const SELECTION_KEY = 'selectedAcademyID'
const SESSION_KEY = 'edra-auth-session'

/** Call once per app process: it creates the only Supabase auth client (one refresh authority). */
export function createPlatformAccess(): PlatformAccess {
  const result = loadConfiguration(
    {
      // Static `process.env.EXPO_PUBLIC_*` reads are inlined at bundle time; keep them literal.
      [SUPABASE_URL_KEY]: process.env.EXPO_PUBLIC_EDRA_SUPABASE_URL,
      [PUBLISHABLE_KEY_KEY]: process.env.EXPO_PUBLIC_EDRA_SUPABASE_PUBLISHABLE_KEY,
      [API_ORIGIN_KEY]: process.env.EXPO_PUBLIC_EDRA_API_ORIGIN,
    },
    __DEV__ ? (process.env.EXPO_PUBLIC_EDRA_DEV_HTTP_HOSTS ?? '').split(',').map((h: string) => h.trim()).filter(Boolean) : null,
  )
  if ('issues' in result) return { configured: false, issues: result.issues }
  const { supabaseUrl, publishableKey, apiOrigin } = result.configuration

  const storage = chunkedSecureStorage(SecureStore)
  const client = createClient(supabaseUrl, publishableKey, {
    auth: {
      storage,
      storageKey: SESSION_KEY,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      lock: processLock,
    },
  })
  // Supabase's React Native guidance: refresh only while the app is in the foreground.
  const lifecycle = (state: string | null | undefined) => (state === 'active' ? client.auth.startAutoRefresh() : client.auth.stopAutoRefresh())
  AppState.addEventListener('change', lifecycle)
  lifecycle(AppState.currentState)

  const session = async (forceRefresh: boolean) => {
    let response
    try {
      response = forceRefresh ? await client.auth.refreshSession() : await client.auth.getSession()
    } catch (error) {
      throw new AuthFailure(classifySessionError(error))
    }
    if (response.error) throw new AuthFailure(classifySessionError(response.error))
    // No stored session at all; a rejected refresh was already removed by the SDK.
    if (!response.data.session) throw new AuthFailure('signedOut')
    return response.data.session
  }

  const authority: AuthAuthority = {
    async restoreSession() {
      await session(false)
    },
    async signIn(phone, password) {
      let error: unknown
      try {
        error = (await client.auth.signInWithPassword({ phone, password })).error
      } catch (thrown) {
        error = thrown
      }
      if (error) throw new SignInFailure(classifySignInError(error))
    },
    async accessToken(forceRefresh) {
      return (await session(forceRefresh)).access_token
    },
    async signOut() {
      try {
        await client.auth.signOut({ scope: 'local' })
      } catch {}
      // The contract always clears local credentials, even if the SDK returned early with an error.
      try {
        await storage.removeItem(SESSION_KEY)
      } catch {}
    },
  }

  // App-private academy id (not a credential). Serialized so writes and clears apply in call order.
  let tail: Promise<unknown> = Promise.resolve()
  const queue = (work: () => Promise<unknown>) => {
    const next = tail.then(work, work)
    tail = next.catch(() => {})
    return next.then(() => {})
  }
  const selection: SelectionStore = {
    read: () => tail.then(() => SecureStore.getItemAsync(SELECTION_KEY)),
    write: (academyId) => queue(() => SecureStore.setItemAsync(SELECTION_KEY, academyId)),
    clear: () => queue(() => SecureStore.deleteItemAsync(SELECTION_KEY)),
  }

  return { configured: true, apiOrigin, authority, selection }
}
