import type { AuthAuthority } from '../../core/auth.ts'
import type { SelectionStore } from './auth.ts'

/** What the host needs from the platform: either setup issues, or the app's single auth authority. */
export type PlatformAccess =
  | { configured: false; issues: string[] }
  | { configured: true; apiOrigin: string; authority: AuthAuthority; selection: SelectionStore }

export const SETUP_INSTRUCTION = 'Set the EXPO_PUBLIC_EDRA_* values in .env.local and rebuild.'

/** Screen bodies each platform file (`AccessScreens.ios.tsx` SwiftUI, `AccessScreens.tsx` Android) provides. */
export type AccessScreenProps = {
  SignIn: { auth: import('./auth.ts').AuthController }
  RestoreFailed: { onRetry: () => void }
  NotConfigured: { issues: string[] }
}
