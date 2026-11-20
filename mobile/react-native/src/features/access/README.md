# Access: sign-in and academy selection

Controllers ported from the iOS `AuthModel`, `AcademiesModel`, `RootView` and `ShellView` wiring. Screens render state and call methods; they own no auth, network or selection rules. This folder also holds the screen bodies and platform auth adapters (below). Both controllers extend `core/model.ts`, so a screen reads them with `useSyncExternalStore(c.subscribe, () => c.version)`.

## Composition (once per app, then once per account scope)

```ts
const authority: AuthAuthority = /* platform adapter, see below */
const auth = new AuthController({ authority, selection })        // app lifetime
const client = new ApiClient({ origin, auth: authority, fetch, newId }) // one client: one refresh authority

// Whenever auth.state === 'authenticated' with a new auth.scope, build fresh models; nothing carries over.
const scope = auth.scope!
const academies = new AcademiesController({
  api: client, scope, selection,
  onUnauthenticated: () => auth.signOutFrom(scope),
  hasUnsavedChanges: () => /* active marking draft has changes */,
  onContextChange: () => { /* go to Sessions, clear both stacks, start.reset() */ },
})
const api = bindRequestPort(client, scope)           // features/sessions/binding.ts
const owner = academies.ownership                    // Sessions `Ownership`
const isCurrent = academies.isCurrent                // Sessions `isCurrent(context)`
// Session screen: const context = academies.context; isCurrent: () => !!context && academies.isCurrent(context)
```

## UI surface

- `AuthController`: `state` (`restoring` → spinner; `restoreFailed` → Retry calling `retryRestore()`; `signedOut`/`signingIn` → sign-in form; `authenticated` with `scope === null` → signing out), `errorMessage`, `phoneError`, `restore()` on launch, `signIn(phone, password)` (normalizes Egyptian numbers; empty/invalid input never reaches the authority), `signOut()` for the user action.
- `AcademiesController`: `state`, `academies`, `selected`, `context`, `load()` on shell mount, `revalidate()` when the app becomes active (true → reload the live list for the unchanged context), `choose(id)` from the Overview academy list (`'confirm'` → show Save / Discard / Keep editing for `pendingAcademy`), `confirmPendingSwitch()` after a successful save or a discard, `dismissPendingSwitch()` on Keep editing or dismissal.
- Rules kept from iOS: only the newest academies load commits; nothing commits after the scope ends; a still-granted selection wins, then the remembered one if the server grants it, then the first; network/server failures keep the granted list; 403 drops all academies; 401 signs out only the owning scope; reselecting keeps the context while A → B → A is a new one; a context change drops any pending switch.

## Screens and adapters (this slice)

- `AccessRoot` (`AccessRoot.tsx`): port of the SwiftUI `RootView`/`AuthenticatedRoot` switch. Not configured → setup screen; `restoring` → "Loading…"; `restoreFailed` → "Couldn't sign you in" + Retry; `signedOut`/`signingIn` → sign-in form; `authenticated` → `signedIn(auth, scope, access)`, remounted per account scope; scope ended → "Signing out…".
- `AccessScreens.ios.tsx`: SwiftUI bodies through `@expo/ui` with the same layout, fonts, colors, keyboard and copy as `SignInView`, `UnavailableView` and `NotConfiguredView`. `AccessScreens.tsx`: React Native bodies for Android with the same structure and copy, Material-like styling, safe areas, TalkBack labels and live-region errors.
- `createPlatformAccess()` (`platform.ts` Android, `platform.ios.ts` iOS; import it extensionless): call once per process. Returns `{ configured: false, issues }` or `{ configured: true, apiOrigin, authority, selection }`.
  - iOS: the local `modules/edra-auth` Expo module wraps the SwiftUI app's own `SupabaseAuthService` and `AppConfiguration` (symlinked Swift sources, supabase-swift pinned to the app's 2.55.3) with default Keychain storage, plus the `selectedAcademyID` UserDefaults key. Rejections carry the Swift failure case as `code`; SDK error text never crosses the bridge.
  - Android: official `@supabase/supabase-js` client (`processLock`, foreground-only auto refresh, no URL session detection). Its session is stored by `chunkedStore.ts` in `expo-secure-store` items (AES key in the Android Keystore), split into ≤ 1,800-byte chunks under a manifest, so values over the 2,048-byte item limit work and an interrupted write keeps the previous session. Sign-out uses local scope and also deletes the stored session. The remembered academy is a SecureStore item written in call order.
  - `classify.ts` maps supabase-js and native errors by type/status/code only, matching `SupabaseAuthService.classify`.
- `AuthController.signIn` ignores a completion that arrives after a sign-out and discards the session it stored, unless a newer sign-in owns it.

## Foundation integration

- `package.json` pins `@supabase/supabase-js@2.119.0`, `react-native-url-polyfill@4.0.0` (supabase-js sets `URL.protocol`, which React Native's URL lacks), and `expo-secure-store@58.0.3`.
- `app.config.ts`:
  - The SecureStore plugin is enabled (excludes its data from Android Auto Backup; the Keystore key is not backed up).
  - `ios.infoPlist`: `EdraSupabaseURL`, `EdraSupabasePublishableKey`, `EdraAPIOrigin` from `process.env.EXPO_PUBLIC_EDRA_SUPABASE_URL`, `…_SUPABASE_PUBLISHABLE_KEY`, `…_API_ORIGIN` (the iOS module validates them with `AppConfiguration`). The generated Debug plist gets the same exact HTTP exception as Swift’s `Configuration/Info-Debug.plist`, written by `plugins/with-edra-ios.cjs`. Release uses a separate plist with ATS defaults.
  - Android reads the same `EXPO_PUBLIC_EDRA_*` values at bundle time; `EXPO_PUBLIC_EDRA_DEV_HTTP_HOSTS` (comma-separated) allows plain-HTTP API hosts in development builds only.
  - iOS session continuity requires the release identity `com.mostafamones.edra` and team `39YK2DQP92` (same Keychain access group as the SwiftUI app). Use the [documented upgrade build](../../../README.md#ios-upgrade-verification) to test this identity. A fresh candidate install with `com.mostafamones.edra.rn` starts signed out.
- Root composition: `const access = createPlatformAccess()` at module scope, then `<AccessRoot access={access} signedIn={(auth, scope, access) => …} />` around the navigation container. Build `ApiClient` with `access.apiOrigin` and `access.authority`, then use the per-scope wiring above. Replace the fixture `AppSessionProvider` sign-out with `auth.signOut()`.
- Native risk to check on macOS: `EdraAuth.podspec` uses React Native's `spm_dependency` for supabase-swift. React Native warns that static linking may need `USE_FRAMEWORKS=dynamic`/`expo-build-properties` `ios.useFrameworks`. This has not been compiled.

## Adapter requirements

- `AuthAuthority` (`core/auth.ts`) is the app's only auth authority, shared by `AuthController` and `ApiClient`.
  - iOS: bridge the existing Supabase Swift client with the current configuration (`SUPABASE_URL`, publishable key, `emitLocalSessionAsInitialSession`) and its default Keychain storage, so installed users keep their session across the migration. Reuse `SupabaseAuthService.classify` and its sign-in mapping; `signOut` uses local scope and never rejects.
  - Android: a Keystore-backed session store behind the same contract, with the same classification (only a missing session or a 4xx session/refresh-token/user rejection is `signedOut`; network, timeout, 429, 5xx and unknown are `unavailable`; a discarded refresh is `cancelled`).
  - Classify by error type and auth-server status/code, never by message text. Never log tokens or passwords.
- `SelectionStore`: academy id only. iOS keeps the `selectedAcademyID` UserDefaults key so the remembered academy survives migration; Android uses app-private storage. Apply writes and clears in call order. Sign-out clears it.
- `ApiClient` needs a `newId` UUID source (Hermes has no `crypto.randomUUID`) and the Web `fetch`.
- Configuration (API origin, Supabase URL/publishable key, HTTPS-only release policy) stays with the platform adapter and the concurrent Expo foundation work.
