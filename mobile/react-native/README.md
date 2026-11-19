# Edra Instructor — React Native candidate

The Expo/React Native foundation and native-chrome prototype for the approved migration (see `../AGENTS.md`). It installs beside the legacy SwiftUI app (`../EdraInstructor.xcodeproj`), which stays the comparison build until cutover. All screens here use fixture data only: no network, Supabase, or API calls.

## Toolchain (pinned)

| | Version |
|---|---|
| Expo SDK | 58.0.26 (React Native 0.88.1, React 19.3.0, Hermes, New Architecture) |
| Native tabs/stack | react-native-screens 4.30.1 + @react-navigation/native-stack 7.21.1 |
| SwiftUI components | @expo/ui 58.0.29; Liquid Glass: expo-glass-effect 58.0.5 |
| iOS minimum | 17.0 (`expo-build-properties`; SDK 58 itself supports 16.4+) |
| Android | minSdk 24, targetSdk 36, compileSdk 37 (SDK 58 defaults) |
| Node | 22 LTS; npm with the committed `package-lock.json` |

Identity: `com.mostafamones.edra.rn`, display name "Edra RN", scheme `edra-rn`. The release identity is decided at cutover.

`ios/` and `android/` are generated (Continuous Native Generation) and git-ignored. Change native settings in `app.config.ts` or a config plugin, never in the generated projects.

## Commands

Run everything from `mobile/react-native`.

```sh
npm ci
npm run check          # typecheck, unit tests, SDK version check, iOS+Android Hermes bundle export
```

### Dev client (Metro)

Build and install the dev client once per native change. iOS requires macOS with Xcode 26+ and CocoaPods; Android requires JDK 17 and the Android SDK (with NDK 27.1.12297006).

```sh
EDRA_APPLE_TEAM_ID=XXXXXXXXXX npm run ios   # connected iPhone (prompts for a device); generates ios/ on first run
npm run android                             # connected phone or emulator
npm run native:save -- ios                  # after installing: record the client's native fingerprint
npm start                                   # Metro for the installed dev client
```

Run `npm run native:check -- ios` (or `android`) before starting Metro. Exit 0 means a Metro reload is enough. Exit 2 means native inputs changed (dependencies, `app.config.ts`, config plugins, local modules), so rebuild and reinstall. JS/TS edits never need a rebuild.

### Release build (no Metro)

The JS bundle is embedded; the app runs without a development server.

```sh
EDRA_APPLE_TEAM_ID=XXXXXXXXXX npm run ios:release
npm run android:release        # signed with the debug keystore: local testing only
```

Signing accounts, TestFlight, App Store and Play distribution are separate, owner-authorized release actions.

## Remote Metro: network safety

Metro serves source code, and its dev tools can execute code in the app. Expose it only to devices you control.

- **Android over USB (preferred):** run `adb reverse tcp:8081 tcp:8081`, then use `http://localhost:8081` in the dev client. Nothing is exposed to a network.
- **Same trusted Wi-Fi:** run `npm run start:lan` and open the URL or QR code from the dev client. On WSL2, phones cannot reach the NAT address. Enable `networkingMode=mirrored` in `%UserProfile%\.wslconfig`, then allow inbound TCP 8081 only on the Windows *Private* profile and only for the LAN subnet.
- **Away from the LAN:** use a private overlay you already control, such as a tailnet: `REACT_NATIVE_PACKAGER_HOSTNAME=<tailnet-ip> npm start`, with ACLs limiting port 8081 to your devices.
- **Never** port-forward 8081 on a router, bind it to a public interface, or use `expo start --tunnel`/public tunnel services. That would publish Metro to the internet.
- iOS asks for Local Network permission the first time the dev client discovers Metro; allow it. The generated ATS keeps `NSAllowsArbitraryLoads` off and enables `NSAllowsLocalNetworking`, so connect by IP address or `.local` name. Android debug builds allow cleartext; release builds do not.

## Prototype coverage and evidence

| Behavior | Implementation | Evidence so far |
|---|---|---|
| Photos-like shell: Sessions + Assessments tabs, separate Academy circle | `Tabs.Host` (UITabBarController); Academy is a `role: "search"` tab (UISearchTab, iOS 26.1+) with `preventNativeSelection` | Static only |
| Academy opens an anchored popover without selecting or dropping tab stacks | `onTabSelectionPrevented` → SwiftUI `.popover` (`@expo/ui` Popover, compact adaptation `.popover`) over the tab item; Android: menu surface | Static only |
| Academy change resets both stacks and presentations, returning to Sessions | Root stack reset in `ShellScreen` | Static only |
| Assessment workspace: search tab becomes "Announce selected" while selecting | Search tab keeps its role; title/icon/action change; selecting turns it into an action tab | Unit test (pane rules) + static |
| Scan tab appears only when allowed and leaves while selecting, without state loss | Workspace state above the tab navigator; TabRouter keeps the remaining routes | Unit test + static |
| Native sheets with keyboard | Marking is a page sheet with Save in its native bar; iOS `automaticallyAdjustKeyboardInsets`, Android `KeyboardAvoidingView`; dirty sheets block swipe/back (`usePreventRemove`) | Static only |
| Interactive Liquid Glass control | `GlassView isInteractive` (UIGlassEffect) "Start session" button | Static only |
| iOS 17–26.0 pre-glass behavior | Classic tab bar (Academy is a third item; the popover anchors to it); bordered-circle button; workspace search in the navigation bar, with Announce *n* in the bar while selecting | Static only |

"Static" means TypeScript, unit tests, `expo export` Hermes bundles for both platforms, and `expo prebuild` generating both native projects (iOS target 17.0). Simulator and physical-device behavior has **not** been observed. Before treating the prototype as parity evidence, record on device: iOS 26.1+, iOS 17 or 18, and one Android phone, with TalkBack/VoiceOver and Dynamic Type.

Known gaps to verify on device or decide:
- iOS 26.0 lacks the UITab search role in react-native-screens, so it uses the classic three-item layout; the SwiftUI app shows a detached circle there.
- Release ATS: the Expo template's `NSAllowsLocalNetworking` is in the shared Info.plist. The SwiftUI release build has no ATS exception, so remove it from Release builds before cutover (config plugin).
- Android colors are light-only until an Android theme is chosen.
- Row selection uses long press; the SwiftUI app uses a context menu (`@expo/ui` ContextMenu is the candidate).

## Integration contract for workflow agents

Folder layout (`src/`):

| Path | Owns |
|---|---|
| `navigation/routes.ts` | Every route name and param list (the contract). |
| `navigation/createNativeTabsNavigator.tsx` | Route adapter: React Navigation `TabRouter` → react-native-screens native tabs. Options: `title`, `icon` (template PNG), `role: "search"` (fixed for the tab's lifetime), `activatesSearch`, `action` (prevents selection, calls back), `accessibilityLabel`, `testID`. |
| `chrome/` | Platform chrome only: `GlassButton`, `PageHeader`, `AcademyMenu` (`.ios.tsx`/`.tsx`), `SheetStack`, header buttons, `platform.ts` gates (`hasLiquidGlass`, `hasSearchTabs`), `colors.ts`, `icons.ts`. No feature state. |
| `features/<feature>/` | Screens and feature state (`shell`, `sessions`, `assessments`). Replace fixture reads with API-backed state here. |
| `fixtures/` | Fixture data. Delete each import as its feature integrates the real API. |
| `assets/icons/` | Hugeicons PNGs generated by `npm run sync:icons` (stroke 1.5, attribution file). Add icons there, not by hand. |

Routes (names are stable; params are the minimum identifiers):

```
Root (native stack, id "root")
├─ Shell                      tabs: SessionsTab | AssessmentsTab | AcademyAction (action)
│  ├─ SessionsTab (stack)     SessionsHome → Session { sessionId }
│  └─ AssessmentsTab (stack)  AssessmentsHome
├─ StartSession               formSheet
└─ Workspace { assignmentId } fullScreenModal; WorkspaceProvider owns state for its lifetime
   ├─ WorkspaceTabs           StudentsTab | ScanTab (conditional) | SearchTab (iOS 26.1+)
   ├─ Marking { studentId, origin: "row" | "search" | "scan" }   page sheet
   └─ Announce { studentIds }                                     page sheet
```

Rules:
- Screens navigate by route name; `navigate` bubbles to the owning navigator. Use `navigation.popTo("Shell", …)` to land on a shell tab from a root presentation (see `StartSessionSheet`).
- Account and academy authority stays in one provider above navigation (`features/shell/AppSession.tsx`, now a fixture). An academy change must reset the root (`ShellScreen.select`). An account change remounts the navigation tree, so no state carries over.
- State that must survive a tab appearing or leaving belongs above that tab navigator (see `WorkspaceState.tsx`), never in a tab screen.
- Native-only behavior goes in a local Expo module at `modules/edra-native-chrome` (Swift/Kotlin, `expo-module.config.json`) consumed by `chrome/`. This prototype does not need one; add it only when a supported package cannot match the SwiftUI behavior. Each new native module requires a rebuild of the dev client.
- Keep all dependencies in this folder's `package.json`, pinned exactly; use `npx expo install --check` to stay on SDK-58-compatible versions.
