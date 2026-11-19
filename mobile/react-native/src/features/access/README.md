# Access: sign-in and academy selection

UI-free controllers ported from the iOS `AuthModel`, `AcademiesModel`, `RootView` and `ShellView` wiring. Screens render state and call methods; they own no auth, network or selection rules. Both controllers extend `core/model.ts`, so a screen reads them with `useSyncExternalStore(c.subscribe, () => c.version)`.

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
- `AcademiesController`: `state`, `academies`, `selected`, `context`, `load()` on shell mount, `revalidate()` when the app becomes active (true → reload the live list for the unchanged context), `choose(id)` from the academy menu (`'confirm'` → show Save / Discard / Keep editing for `pendingAcademy`), `confirmPendingSwitch()` after a successful save or a discard, `dismissPendingSwitch()` on Keep editing or dismissal.
- Rules kept from iOS: only the newest academies load commits; nothing commits after the scope ends; a still-granted selection wins, then the remembered one if the server grants it, then the first; network/server failures keep the granted list; 403 drops all academies; 401 signs out only the owning scope; reselecting keeps the context while A → B → A is a new one; a context change drops any pending switch.

## Adapter requirements

- `AuthAuthority` (`core/auth.ts`) is the app's only auth authority, shared by `AuthController` and `ApiClient`.
  - iOS: bridge the existing Supabase Swift client with the current configuration (`SUPABASE_URL`, publishable key, `emitLocalSessionAsInitialSession`) and its default Keychain storage, so installed users keep their session across the migration. Reuse `SupabaseAuthService.classify` and its sign-in mapping; `signOut` uses local scope and never rejects.
  - Android: a Keystore-backed session store behind the same contract, with the same classification (only a missing session or a 4xx session/refresh-token/user rejection is `signedOut`; network, timeout, 429, 5xx and unknown are `unavailable`; a discarded refresh is `cancelled`).
  - Classify by error type and auth-server status/code, never by message text. Never log tokens or passwords.
- `SelectionStore`: academy id only. iOS keeps the `selectedAcademyID` UserDefaults key so the remembered academy survives migration; Android uses app-private storage. Apply writes and clears in call order. Sign-out clears it.
- `ApiClient` needs a `newId` UUID source (Hermes has no `crypto.randomUUID`) and the Web `fetch`.
- Configuration (API origin, Supabase URL/publishable key, HTTPS-only release policy) stays with the platform adapter and the concurrent Expo foundation work.
