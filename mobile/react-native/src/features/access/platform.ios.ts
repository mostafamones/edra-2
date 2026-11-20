// iOS adapter: the SwiftUI app's Supabase Swift session (Keychain) and UserDefaults selection, via the
// local `edra-auth` module, so an upgrade from the SwiftUI app keeps the instructor signed in.
import { loadEdraAuth } from '../../../modules/edra-auth/index.ts'
import type { AuthAuthority } from '../../core/auth.ts'
import type { SelectionStore } from './auth.ts'
import { nativeAuthFailure, nativeSignInFailure } from './classify.ts'
import type { PlatformAccess } from './platformTypes.ts'

export function createPlatformAccess(): PlatformAccess {
  const native = loadEdraAuth()
  const configuration = native.configuration()
  if (configuration.issues) return { configured: false, issues: configuration.issues }

  const authority: AuthAuthority = {
    restoreSession: () => native.restoreSession().catch((error: unknown) => Promise.reject(nativeAuthFailure(error))),
    signIn: (phone, password) =>
      native.signIn(phone, password).catch((error: unknown) => Promise.reject(nativeSignInFailure(error))),
    accessToken: (forceRefresh) =>
      native.accessToken(forceRefresh).catch((error: unknown) => Promise.reject(nativeAuthFailure(error))),
    signOut: () => native.signOut().catch(() => {}),
  }
  // Synchronous UserDefaults calls, so writes and clears apply in call order.
  const selection: SelectionStore = {
    read: () => native.readSelection(),
    write: (academyId) => native.writeSelection(academyId),
    clear: () => native.clearSelection(),
  }
  return { configured: true, apiOrigin: configuration.apiOrigin, authority, selection }
}
