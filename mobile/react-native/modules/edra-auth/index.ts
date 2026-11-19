import { requireNativeModule } from 'expo'

/**
 * iOS bridge to the existing Swift `SupabaseAuthService` (Supabase Swift SDK, default Keychain storage) and
 * the `selectedAcademyID` UserDefaults key, so installed SwiftUI users keep their session and academy.
 * Rejections carry the Swift failure case as `code`. Load it lazily: the module exists only on iOS.
 */
export interface EdraAuthNativeModule {
  /** The validated Info.plist configuration (iOS `AppConfiguration.load`). */
  configuration(): { apiOrigin: string; issues?: undefined } | { apiOrigin?: undefined; issues: string[] }
  restoreSession(): Promise<void>
  signIn(phone: string, password: string): Promise<void>
  accessToken(forceRefresh: boolean): Promise<string>
  signOut(): Promise<void>
  readSelection(): string | null
  writeSelection(academyId: string): void
  clearSelection(): void
}

export const loadEdraAuth = () => requireNativeModule<EdraAuthNativeModule>('EdraAuth')
