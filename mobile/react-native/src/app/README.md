# App composition

`EdraApp` is the instructor app below the foundation's providers: `AccessRoot` (setup, restore, sign-in), then one signed-in shell per account scope. Port of the SwiftUI `RootView`, `SignedInRoot` and `ShellView`.

| File | Owns |
| --- | --- |
| `EdraApp.tsx` | Entry component: platform access, the `ApiClient`, the shell view (pages, five tabs, Overview and Settings, start picker, switch guard, foreground revalidation) |
| `shell.ts` | `Shell`: one account scope's models, selected tab, Overview/Sessions/Assessments histories, academy-change resets, the unsaved-marks switch guard |
| `contract.ts` | What the foundation injects: `AppChrome`, `AppServices`, `EdraAppProps` |

## Behavior kept from the SwiftUI shell

- `createPlatformAccess()` runs once per process. One `ApiClient` is created per mounted authority and shared by every account scope, so forced refreshes are shared.
- Each account scope builds new `AcademiesController`, `LiveSessionsModel`, `SchedulesModel`, `StartSessionModel` and `AssignmentsModel`. Their callbacks are bound to that scope: a 401 calls `auth.signOutFrom(scope)`; a 403 reloads the academies. Settings' Sign out calls `auth.signOut()`.
- The academies load when the shell mounts. Every academy context change, including losing access, selects Overview, clears the Sessions history, resets the start flow, closes the assessment workspace and loads live sessions, schedules and assignments for the new context. Settings is account-level and stays open. Reselecting the current academy changes nothing.
- Sessions and Assessments keep separate histories. Popping Sessions back to its root reloads the live list. An acknowledged start selects Sessions and replaces its history with the server's session.
- When the app becomes active (`AppState`), access is revalidated, then live sessions reload if the academy is unchanged.
- Choosing another academy with an unsaved marking draft shows "Save marks before switching academy?" with Save, Discard and Keep editing. Save switches only after an acknowledged save. No action runs if the academy or draft changed while the dialog was open. A dismissal leaves no pending switch.
- The page header and its academy name, or the Loading academies, Couldn't load academies and No staff access states. The Start session glass button matches `ShellView`.
- Late-after minutes are stored per academy through `services.lateDeadlines(academyId)`.

## React Native shell (supersedes the SwiftUI Academy tab for this app)

The owner directed a five-tab shell for the React Native app: Overview (initial), Sessions, Assessments, Students and Concerns. The SwiftUI app keeps its Academy tab as the reference.

- Overview: "Hello, <name>" and the account picture from `GET /api/v1/me` (`ProfileModel`, one per account scope, reloaded on foreground to renew the one-hour picture URL). Without a name it reads "Hello"; without a valid picture, or if it fails to load, the neutral profile icon shows. A 404 marks an older server without the endpoint (`unsupported`); a failed refresh keeps the last name. The avatar opens Settings in Overview's stack. Every granted academy with its role; the current one is checked and choosing another goes through `chooseAcademy` and the switch guard. For the current academy only, its first three live sessions and active assignments from the lists the shell already loads, with links to the full tabs. No counts are shown: those lists are first pages.
- A session opened from Overview selects Sessions with only that session open. An assignment opens its workspace on Assessments (`Shell.assignment`).
- Settings shows the same name and picture (read-only) and Sign out, and is reachable with zero academies.
- Students and Concerns show "Coming soon".
- The five main tabs are icon-only; each keeps its title as the accessibility name. The workspace tabs keep their labels.
- Missing contract: no bounded per-academy recap read, so other academies show only name and role. Add it through an approved API plan.

## Foundation integration (not changed here)

```tsx
// App.tsx, inside SafeAreaProvider / theme / StatusBar.
<EdraApp chrome={appChrome} sessions={sessionsPlatform} assessments={assessmentPlatform}
  services={{ fetch, newId: randomUUID, lateDeadlines, feedback }} />
```

- `chrome.Tabs`: native tabs (`react-native-screens` Tabs). Show `tabs[i].content` and keep every tab mounted.
- `chrome.Stack`: a controlled native stack per tab (`ScreenStack`/`ScreenStackItem`). `root` hides the bar. Pushed routes set their own header through `SessionsPlatform.Header`. Report a user pop with `onPop(remainingRouteCount)`.
- `chrome.PageHeader`: the existing `chrome/PageHeader`. The Start session button uses `SessionsPlatform.GlassButton`.
- `services.newId`: an RFC 4122 v4 UUID source, for example `expo-crypto` `randomUUID` (`npx expo install expo-crypto`). Hermes may not provide `crypto.randomUUID`, which the sessions models use by default.
- `services.lateDeadlines`: synchronous app-private storage. To keep values from the SwiftUI app, read `lateAfterMinutes.<sessionId>` from `UserDefaults` on iOS. Session ids are UUIDs, so per-academy keys do not collide.
- Dependencies from `features/access/README.md` still apply: `@supabase/supabase-js`, `react-native-url-polyfill` and `expo-secure-store`.

## Checks

`node --test src/app/*.test.ts` covers the shell over the real controllers and `ApiClient` with a routed fake fetch: Overview as the initial tab, selection on mount, academy-change resets, independent histories, Overview session/assignment navigation, Settings and zero-academy sign-out, start navigation, 401/403 handling, foreground revalidation, the switch guard, per-academy late deadlines and scope ownership. Native tabs, stacks, VoiceOver, TalkBack and devices are untested until the foundation supplies `AppChrome`.
