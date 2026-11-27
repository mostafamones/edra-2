import { Fragment, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { AccountScope } from '../../core/ownership.ts'
import { AuthController } from './auth.ts'
// Extensionless so Metro picks `AccessScreens.ios.tsx` on iOS.
import { NotConfiguredScreen, RestoreFailedScreen, RestoringScreen, SignInScreen, SigningOutScreen } from './AccessScreens'
import type { PlatformAccess } from './platformTypes.ts'

type Configured = Extract<PlatformAccess, { configured: true }>
export type SignedIn = (auth: AuthController, scope: AccountScope, access: Configured) => ReactNode

const scopeKeys = new WeakMap<AccountScope, number>()
let lastKey = 0
const keyOf = (scope: AccountScope) => scopeKeys.get(scope) ?? (scopeKeys.set(scope, ++lastKey), lastKey)

/**
 * Port of the SwiftUI RootView/AuthenticatedRoot switch. `access` comes from `createPlatformAccess()`, called
 * once per process. `signedIn` renders the shell; it remounts per account scope so nothing carries over.
 */
export function AccessRoot({ access, signedIn }: { access: PlatformAccess; signedIn: SignedIn }) {
  if (!access.configured) return <NotConfiguredScreen issues={access.issues} />
  return <AuthGate access={access} signedIn={signedIn} />
}

function AuthGate({ access, signedIn }: { access: Configured; signedIn: SignedIn }) {
  const [auth] = useState(() => new AuthController({ authority: access.authority, selection: access.selection }))
  useSyncExternalStore(auth.subscribe, () => auth.version)
  useEffect(() => void auth.restore(), [auth])

  switch (auth.state) {
    case 'restoring':
      return <RestoringScreen />
    case 'restoreFailed':
      // The stored session is kept; nothing academy-scoped loads until a retry succeeds.
      return <RestoreFailedScreen onRetry={() => void auth.retryRestore()} />
    case 'signedOut':
    case 'signingIn':
      return <SignInScreen auth={auth} />
    case 'authenticated':
      return auth.scope ? <Fragment key={keyOf(auth.scope)}>{signedIn(auth, auth.scope, access)}</Fragment> : <SigningOutScreen />
  }
}
