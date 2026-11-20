# Sessions and attendance screens

React Native screen bodies for the Sessions tab, ported from the SwiftUI views in
`mobile/EdraInstructor/Features/{Sessions,StartSession,Scanner}`. They compose the domain models in
`../` (no network, auth or attendance rules here) and render native chrome only through the
`SessionsPlatform` contract in `platform.ts`.

| Screen | SwiftUI reference | Presentation |
| --- | --- | --- |
| `SessionsHomeScreen` | `SessionsHomeView`, `SessionCard` | Sessions tab root body |
| `StartSessionSheet` / `StartSessionScreen` | `StartSessionView` | Page sheet over the shell |
| `SessionScreen` | `SessionView`, `StudentCard` | Pushed on the Sessions stack |
| `FinalizeReviewSheet` | `FinalizeReviewSheet` | Sheet from `SessionScreen` |
| `LateDeadlineSheet` | `LateDeadlineSheet` | Medium-detent sheet from `SessionScreen` |
| `AddAttendeeScreen` | `AddAttendeeView` | Sheet from `SessionScreen` or the scanner |
| `ScannerScreen` | `ScannerView` | Full-screen cover from `SessionScreen` |

`SessionScreen` presents its own children (finalize, late deadline, add attendee, scanner) through
`platform.Sheet`, so the routes the foundation registers are only the home body, the start sheet and the
pushed session.

## Platform contract

The foundation supplies one `SessionsPlatform` object. `corePlatform` is a React Native-core stand-in
(Alert/ActionSheetIOS, `Modal`, an in-screen header, empty icon boxes, no camera) for development only.

| Member | iOS (exact iPhone experience) | Android |
| --- | --- | --- |
| `Header` | Native-stack/sheet nav bar, inline title, bar items (`role` → cancellation/confirmation placement), `.searchable` | Top app bar with actions and a search field |
| `Sheet` | Page sheet; `detent="medium"`; `fullScreen` cover; `dismissDisabled` = `interactiveDismissDisabled`. Mount children only while presented | Modal bottom sheet / full-screen dialog; back ignored when `dismissDisabled` |
| `Menu` | UIMenu, fixed order, checkmarks, destructive, dividers | Popup menu with checkable items |
| `GlassButton` | `.glassProminent` circle on iOS 26, `.borderedProminent` circle earlier | Filled circular button (no glass) |
| `Icon` | Bundled Hugeicons asset (stroke 1.5) by asset name | Same glyphs as vector drawables |
| `Camera` | AVFoundation preview + barcode decoding, `CameraControls` torch/zoom glass overlay, pinch zoom; call `onCodes` with every frame's codes (empty when none) | CameraX/ML Kit equivalent, controls without glass |
| `present` | `alert` → UIAlertController alert; `actionSheet` → confirmation dialog | AlertDialog |
| `requestCameraAccess`, `openSettings` | AVCaptureDevice permission, app Settings | Runtime permission, app settings |
| `useIsFocused` | Route focus (drives the 10 s attendance refresh) | Same |
| `useBottomInset` | Safe area + tab bar of the current presentation | Same |

Screens use iOS system colors through `PlatformColor` and the `AccentColor` asset, and fixed light/dark
pairs on Android (`theme.ts`). Text sizes follow iOS text styles and scale with the system text size.

## Route composition

```tsx
import { SessionsHomeScreen, SessionScreen, StartSessionSheet } from './features/sessions/screens/index.ts'

// Sessions tab root. The shell keeps the large "Sessions" title, the academy subtitle and the Start
// button (`start.presentPicker()`), and reloads `sessions` on context change, on foreground and when
// the stack pops back to the root.
<SessionsHomeScreen context={context} sessions={sessions} onOpen={(s) => navigation.push('Session', { session: s })} />

// Pushed route `Session`.
<SessionScreen session={route.params.session} makeModel={makeSessionModel} platform={platform} />

// Once in the signed-in shell, while an academy is selected.
<StartSessionSheet academy={{ name: academy.name, icon: academy.iconAsset }} context={context}
  schedules={schedules} start={start} platform={platform} />

// Navigate when a start is acknowledged; the destination comes from the server.
useEffect(() => {
  if (!start.destination) return
  const destination = start.destination
  start.destination = null
  navigation.navigate('Sessions'); navigation.push('Session', { session: destination })
}, [start.version])
```

On an academy or account change the shell pops the Sessions stack and calls `start.reset()`, as
`ShellView` does. `makeSessionModel` constructs `SessionDetailModel` with the bound request port, an
`isCurrent` bound to the opening account/academy, ownership callbacks and a `LateAfterStore`.

## Checks

`node --test mobile/react-native/src/features/sessions/screens/*.test.ts` covers the formatting helpers.
Screen rendering, native chrome, VoiceOver/TalkBack, Dynamic Type and device behavior are verified once
the foundation's Expo project and native components exist.
